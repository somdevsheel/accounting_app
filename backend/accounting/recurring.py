"""Recurring invoice/receipt template scheduling: advancing next-run dates."""
import datetime

FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Annually"]


def _add_months(d: datetime.date, months: int) -> datetime.date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                       31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return datetime.date(year, month, day)


def advance_date(d: datetime.date, frequency: str) -> datetime.date:
    if frequency == "Weekly":
        return d + datetime.timedelta(days=7)
    if frequency == "Quarterly":
        return _add_months(d, 3)
    if frequency == "Annually":
        return _add_months(d, 12)
    return _add_months(d, 1)  # Monthly, default
