"""Payroll math: gross -> deductions -> net. Pure local computation, no statutory
rules baked in — deduction types (PF, income tax, insurance, ...) are configured
by the user per-country/company, same pattern as the Tax Configuration screen."""


def compute_payslip(gross_pay: float, deduction_types: list) -> dict:
    """deduction_types: list of objects with .name, .calc_type ('Percent'/'Fixed'),
    .value, .applies_to ('Employee'/'Employer')."""
    lines = []
    employee_total = 0.0
    employer_total = 0.0
    for dt in deduction_types:
        amount = dt.value if dt.calc_type == "Fixed" else round(gross_pay * dt.value / 100.0, 2)
        lines.append({"name": dt.name, "applies_to": dt.applies_to, "amount": amount})
        if dt.applies_to == "Employer":
            employer_total += amount
        else:
            employee_total += amount
    net_pay = round(gross_pay - employee_total, 2)
    return {
        "gross_pay": round(gross_pay, 2),
        "deductions": lines,
        "employee_deductions_total": round(employee_total, 2),
        "employer_contributions_total": round(employer_total, 2),
        "net_pay": net_pay,
    }
