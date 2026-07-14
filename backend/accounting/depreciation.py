"""Straight-line depreciation, prorated by days, plus a financial-year schedule."""
import datetime

from accounting.fy import fy_range, fy_label


def asset_snapshot(asset, as_of=None):
    as_of = as_of or datetime.date.today()
    depreciable = max(asset.cost - asset.residual_value, 0.0)
    annual = depreciable / asset.useful_life_years if asset.useful_life_years else 0.0
    daily = annual / 365.0

    end_date = as_of
    if asset.is_disposed and asset.disposed_date:
        end_date = min(asset.disposed_date, as_of)

    days = max((end_date - asset.purchase_date).days, 0)
    accumulated = round(min(daily * days, depreciable), 2)
    book_value = round(asset.cost - accumulated, 2)
    return {
        "annual_depreciation": round(annual, 2),
        "daily_depreciation": round(daily, 4),
        "accumulated_depreciation": accumulated,
        "book_value": book_value,
        "depreciable_value": round(depreciable, 2),
    }


def depreciation_schedule(asset, fy_start_month: int, as_of=None):
    as_of = as_of or datetime.date.today()
    depreciable = max(asset.cost - asset.residual_value, 0.0)
    annual = depreciable / asset.useful_life_years if asset.useful_life_years else 0.0
    daily = annual / 365.0

    end_date = as_of
    if asset.is_disposed and asset.disposed_date:
        end_date = min(asset.disposed_date, as_of)

    if asset.purchase_date > end_date:
        return []

    schedule = []
    cursor_start, cursor_end = fy_range(asset.purchase_date, fy_start_month)
    accumulated = 0.0
    while cursor_start <= end_date:
        period_start = max(cursor_start, asset.purchase_date)
        period_end = min(cursor_end, end_date)
        days_in_fy = max((period_end - period_start).days + 1, 0)
        dep_this_fy = min(daily * days_in_fy, depreciable - accumulated)
        dep_this_fy = max(dep_this_fy, 0.0)
        accumulated = round(accumulated + dep_this_fy, 2)
        schedule.append(
            {
                "financial_year": fy_label(cursor_start, fy_start_month),
                "days_held": days_in_fy,
                "depreciation_amount": round(dep_this_fy, 2),
                "accumulated_depreciation": accumulated,
                "book_value": round(asset.cost - accumulated, 2),
            }
        )
        cursor_start, cursor_end = fy_range(
            cursor_end + datetime.timedelta(days=1), fy_start_month
        )
    return schedule
