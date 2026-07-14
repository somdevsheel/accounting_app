"""Standard amortization / EMI calculations for the Loan Register."""
import datetime


def calculate_emi(principal: float, annual_rate: float, tenure_months: int) -> float:
    if tenure_months <= 0:
        return 0.0
    r = (annual_rate / 12.0) / 100.0
    if r == 0:
        return round(principal / tenure_months, 2)
    factor = (1 + r) ** tenure_months
    emi = principal * r * factor / (factor - 1)
    return round(emi, 2)


def amortization_schedule(principal, annual_rate, tenure_months, start_date):
    emi = calculate_emi(principal, annual_rate, tenure_months)
    r = (annual_rate / 12.0) / 100.0
    balance = principal
    schedule = []
    for i in range(1, tenure_months + 1):
        interest = round(balance * r, 2)
        principal_component = round(emi - interest, 2)
        if i == tenure_months:
            principal_component = round(balance, 2)
            emi_this = round(principal_component + interest, 2)
        else:
            emi_this = emi
        balance = round(balance - principal_component, 2)
        due_month = start_date.month - 1 + i
        due_year = start_date.year + (due_month // 12)
        due_month = due_month % 12 + 1
        due_date = datetime.date(due_year, due_month, min(start_date.day, 28))
        schedule.append(
            {
                "installment_no": i,
                "due_date": due_date,
                "emi": emi_this,
                "principal_component": principal_component,
                "interest_component": interest,
                "balance": max(balance, 0.0),
            }
        )
    return emi, schedule


def loan_status(loan, as_of=None):
    as_of = as_of or datetime.date.today()
    emi, schedule = amortization_schedule(
        loan.principal, loan.interest_rate_annual, loan.tenure_months, loan.start_date
    )
    installments_paid = sum(1 for row in schedule if row["due_date"] <= as_of)
    installments_paid = min(installments_paid, loan.tenure_months)
    outstanding = loan.principal
    total_interest_paid = 0.0
    if installments_paid > 0:
        outstanding = schedule[installments_paid - 1]["balance"]
        total_interest_paid = round(
            sum(row["interest_component"] for row in schedule[:installments_paid]), 2
        )
    return {
        "emi": emi,
        "outstanding_balance": round(outstanding, 2),
        "total_interest_paid": total_interest_paid,
        "installments_paid": installments_paid,
        "schedule": schedule,
    }
