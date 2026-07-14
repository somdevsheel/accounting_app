"""Financial-year helpers driven by the company's configured start month."""
import datetime
from typing import Tuple


def fy_start_date(for_date: datetime.date, fy_start_month: int) -> datetime.date:
    if for_date.month >= fy_start_month:
        return datetime.date(for_date.year, fy_start_month, 1)
    return datetime.date(for_date.year - 1, fy_start_month, 1)


def fy_end_date(start: datetime.date) -> datetime.date:
    end_year = start.year + 1
    end_month = start.month
    next_start = datetime.date(end_year, end_month, 1)
    return next_start - datetime.timedelta(days=1)


def fy_range(for_date: datetime.date, fy_start_month: int) -> Tuple[datetime.date, datetime.date]:
    start = fy_start_date(for_date, fy_start_month)
    return start, fy_end_date(start)


def fy_label(start: datetime.date, fy_start_month: int) -> str:
    if fy_start_month == 1:
        return f"FY{start.year}"
    return f"FY{start.year}-{str(start.year + 1)[-2:]}"


def fy_quarter(for_date: datetime.date, fy_start_month: int) -> int:
    month_offset = (for_date.month - fy_start_month) % 12
    return (month_offset // 3) + 1


def period_key(for_date: datetime.date, fy_start_month: int, granularity: str) -> str:
    """Return a sortable+display key for grouping by month/quarter/year."""
    start, _ = fy_range(for_date, fy_start_month)
    label = fy_label(start, fy_start_month)
    if granularity == "annual":
        return label
    if granularity == "quarterly":
        return f"{label} Q{fy_quarter(for_date, fy_start_month)}"
    return for_date.strftime("%Y-%m")
