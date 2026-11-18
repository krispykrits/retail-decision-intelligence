import csv
import hashlib
import json
import re
from collections.abc import Iterator
from datetime import date, datetime
from decimal import Decimal
from functools import lru_cache
from typing import BinaryIO

from retail_api.imports.schemas import Dataset

SOURCE_COLUMNS = {
    Dataset.HOUSEHOLDS: dict(
        HSHD_NUM="household_id",
        L="loyalty_flag",
        AGE_RANGE="age_range",
        MARITAL="marital_status",
        INCOME_RANGE="income_range",
        HOMEOWNER="homeowner",
        HSHD_COMPOSITION="household_composition",
        HH_SIZE="household_size",
        CHILDREN="children",
    ),
    Dataset.PRODUCTS: dict(
        PRODUCT_NUM="product_id",
        DEPARTMENT="department",
        COMMODITY="commodity",
        BRAND_TY="brand_type",
        NATURAL_ORGANIC_FLAG="natural_organic_flag",
    ),
    Dataset.TRANSACTIONS: dict(
        BASKET_NUM="basket_id",
        HSHD_NUM="household_id",
        PURCHASE_="purchase_date",
        PRODUCT_NUM="product_id",
        SPEND="spend",
        UNITS="units",
        STORE_R="store_region",
        WEEK_NUM="week_number",
        YEAR="year",
    ),
}
ID_PATTERN = re.compile(r"[0-9]{1,32}")
INTEGER_PATTERN = re.compile(r"[+-]?[0-9]{1,10}")
SPEND_PATTERN = re.compile(r"[+-]?(?:[0-9]{1,10}(?:\.[0-9]{0,4})?|\.[0-9]{1,4})")
MAX_ROW_BYTES = 64 * 1024
REGIONS = {"EAST", "CENTRAL", "WEST", "SOUTH"}


class InvalidCSV(ValueError):
    pass


def reading_lines(file: BinaryIO) -> Iterator[str]:
    first = True
    while line := file.readline(MAX_ROW_BYTES + 1):
        if len(line) > MAX_ROW_BYTES:
            raise InvalidCSV("A CSV line exceeds 64 KiB.")
        yield line.decode("utf-8-sig" if first else "utf-8")
        first = False


def csv_rows(file: BinaryIO, dataset: Dataset) -> Iterator[dict[str, object]]:
    mapping = SOURCE_COLUMNS[dataset]
    reader = csv.reader(reading_lines(file), strict=True)
    try:
        header = [cell.strip().upper() for cell in next(reader, [])]
        if len(header) != len(mapping) or set(header) != mapping.keys():
            raise InvalidCSV(f"Expected these CSV columns: {', '.join(mapping)}.")
        columns = [mapping[source] for source in header]
        row_number = reader.line_num + 1
        for row in reader:
            if row:
                yield prepare_row(dataset, columns, row, row_number)
            row_number = reader.line_num + 1
    except UnicodeDecodeError as error:
        raise InvalidCSV("Save the file as UTF-8 CSV and try again.") from error
    except csv.Error as error:
        raise InvalidCSV(f"Malformed CSV near line {reader.line_num}.") from error


def prepare_row(
    dataset: Dataset, columns: list[str], row: list[str], row_number: int
) -> dict[str, object]:
    outcome: dict[str, object] = {"row_number": row_number}
    if len(row) != len(columns):
        return {**outcome, "reason": "Row has the wrong number of columns."}

    fields = dict(zip(columns, (cell.strip() for cell in row), strict=True))
    try:
        values = normalize_fields(dataset, fields)
    except ValueError as error:
        return {**outcome, "reason": str(error)}
    normalized = json.dumps(values, sort_keys=True, separators=(",", ":"), default=str)
    return {**outcome, **values, "row_hash": hashlib.sha256(normalized.encode()).hexdigest()}


@lru_cache(maxsize=4096)
def purchase_date(value: str) -> date:
    try:
        if len(value) == 10 and value[4] == "-" and value[7] == "-":
            return date.fromisoformat(value)
        return datetime.strptime(value, "%d-%b-%y").date()
    except ValueError as error:
        raise ValueError("Purchase date must be valid (YYYY-MM-DD or DD-MON-YY).") from error


def integer(value: str, minimum: int, maximum: int, label: str) -> int:
    if INTEGER_PATTERN.fullmatch(value) and minimum <= (number := int(value)) <= maximum:
        return number
    raise ValueError(f"{label} must be a valid integer.")


def normalize_fields(dataset: Dataset, fields: dict[str, str]) -> dict[str, object]:
    values: dict[str, object] = {}
    for name, value in fields.items():
        label = name.replace("_", " ").capitalize()
        if name.endswith("_id"):
            if not ID_PATTERN.fullmatch(value):
                raise ValueError(f"{label} must contain 1–32 digits.")
        elif name in {"loyalty_flag", "natural_organic_flag"}:
            if value.upper() not in {"Y", "N"}:
                raise ValueError(f"{label} must be Y or N.")
            value = value.upper()
        elif dataset is Dataset.HOUSEHOLDS and value.lower() in {"", "null"}:
            values[name] = None
            continue
        elif not value or len(value) > 80 or "\x00" in value:
            raise ValueError(f"{label} must contain 1–80 characters.")
        values[name] = value

    if dataset is Dataset.TRANSACTIONS:
        if not SPEND_PATTERN.fullmatch(fields["spend"]):
            raise ValueError("Spend must be a decimal with up to 4 fractional digits.")
        amount = Decimal(fields["spend"]).quantize(Decimal("0.0001"))
        values["spend"] = abs(amount) if amount.is_zero() else amount
        values["units"] = integer(fields["units"], -(2**31), 2**31 - 1, "Units")
        values["purchase_date"] = purchase_date(fields["purchase_date"])
        values["week_number"] = integer(fields["week_number"], 1, 53, "Week number")
        values["year"] = integer(fields["year"], 1, 9999, "Year")
        region = fields["store_region"].upper()
        if region not in REGIONS:
            raise ValueError("Store region must be EAST, CENTRAL, WEST, or SOUTH.")
        values["store_region"] = region
    return values
