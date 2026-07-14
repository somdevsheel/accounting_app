from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from accounting.numbering import next_voucher_no
from accounting.payroll import compute_payslip
from database import get_db

router = APIRouter(prefix="/api", tags=["payroll"])


# ---------- Employees ----------


@router.get("/employees", response_model=list[schemas.EmployeeOut])
def list_employees(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(models.Employee)
    if not include_inactive:
        q = q.filter(models.Employee.is_active.is_(True))
    return q.order_by(models.Employee.name).all()


@router.post("/employees", response_model=schemas.EmployeeOut)
def create_employee(payload: schemas.EmployeeIn, db: Session = Depends(get_db)):
    employee = models.Employee(**payload.model_dump(), is_active=True)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.put("/employees/{employee_id}", response_model=schemas.EmployeeOut)
def update_employee(employee_id: int, payload: schemas.EmployeeIn, db: Session = Depends(get_db)):
    employee = db.query(models.Employee).get(employee_id)
    if not employee:
        raise HTTPException(404, "Employee not found")
    for field, value in payload.model_dump().items():
        setattr(employee, field, value)
    db.commit()
    db.refresh(employee)
    return employee


@router.post("/employees/{employee_id}/deactivate")
def deactivate_employee(employee_id: int, db: Session = Depends(get_db)):
    employee = db.query(models.Employee).get(employee_id)
    if not employee:
        raise HTTPException(404, "Employee not found")
    employee.is_active = False
    db.commit()
    return {"ok": True}


@router.post("/employees/{employee_id}/activate")
def activate_employee(employee_id: int, db: Session = Depends(get_db)):
    employee = db.query(models.Employee).get(employee_id)
    if not employee:
        raise HTTPException(404, "Employee not found")
    employee.is_active = True
    db.commit()
    return {"ok": True}


# ---------- Payroll deduction types ----------


@router.get("/payroll-deduction-types", response_model=list[schemas.PayrollDeductionTypeOut])
def list_deduction_types(db: Session = Depends(get_db)):
    return db.query(models.PayrollDeductionType).filter(models.PayrollDeductionType.is_active.is_(True)).all()


@router.post("/payroll-deduction-types", response_model=schemas.PayrollDeductionTypeOut)
def create_deduction_type(payload: schemas.PayrollDeductionTypeIn, db: Session = Depends(get_db)):
    dt = models.PayrollDeductionType(**payload.model_dump(), is_active=True)
    db.add(dt)
    db.commit()
    db.refresh(dt)
    return dt


@router.delete("/payroll-deduction-types/{type_id}")
def delete_deduction_type(type_id: int, db: Session = Depends(get_db)):
    dt = db.query(models.PayrollDeductionType).get(type_id)
    if not dt:
        raise HTTPException(404, "Deduction type not found")
    dt.is_active = False
    db.commit()
    return {"ok": True}


# ---------- Payroll runs ----------


def _serialize_run(run: models.PayrollRun) -> dict:
    payslips = [
        {
            "id": p.id,
            "employee_id": p.employee_id,
            "employee_name": p.employee.name if p.employee else None,
            "gross_pay": p.gross_pay,
            "employee_deductions_total": p.employee_deductions_total,
            "employer_contributions_total": p.employer_contributions_total,
            "net_pay": p.net_pay,
            "deductions": [{"name": d.name, "applies_to": d.applies_to, "amount": d.amount} for d in p.deductions],
        }
        for p in run.payslips
    ]
    return {
        "id": run.id,
        "month": run.month,
        "run_date": run.run_date,
        "status": run.status,
        "journal_entry_id": run.journal_entry_id,
        "payslips": payslips,
        "total_gross": round(sum(p["gross_pay"] for p in payslips), 2),
        "total_net": round(sum(p["net_pay"] for p in payslips), 2),
    }


@router.get("/payroll-runs", response_model=list[schemas.PayrollRunOut])
def list_payroll_runs(db: Session = Depends(get_db)):
    runs = db.query(models.PayrollRun).order_by(models.PayrollRun.run_date.desc()).all()
    return [_serialize_run(r) for r in runs]


@router.get("/payroll-runs/{run_id}", response_model=schemas.PayrollRunOut)
def get_payroll_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(models.PayrollRun).get(run_id)
    if not run:
        raise HTTPException(404, "Payroll run not found")
    return _serialize_run(run)


@router.post("/payroll-runs", response_model=schemas.PayrollRunOut)
def create_payroll_run(payload: schemas.PayrollRunIn, db: Session = Depends(get_db)):
    if db.query(models.PayrollRun).filter(models.PayrollRun.month == payload.month).first():
        raise HTTPException(400, f"A payroll run for {payload.month} already exists")
    employees = db.query(models.Employee).filter(models.Employee.is_active.is_(True)).all()
    if not employees:
        raise HTTPException(400, "No active employees to run payroll for")
    deduction_types = db.query(models.PayrollDeductionType).filter(models.PayrollDeductionType.is_active.is_(True)).all()

    run = models.PayrollRun(month=payload.month, run_date=payload.run_date, status="Draft")
    db.add(run)
    db.flush()

    for emp in employees:
        result = compute_payslip(emp.basic_salary, deduction_types)
        payslip = models.Payslip(
            payroll_run_id=run.id,
            employee_id=emp.id,
            gross_pay=result["gross_pay"],
            employee_deductions_total=result["employee_deductions_total"],
            employer_contributions_total=result["employer_contributions_total"],
            net_pay=result["net_pay"],
        )
        db.add(payslip)
        db.flush()
        for d in result["deductions"]:
            db.add(models.PayslipDeduction(payslip_id=payslip.id, name=d["name"], applies_to=d["applies_to"], amount=d["amount"]))

    db.commit()
    db.refresh(run)
    return _serialize_run(run)


@router.post("/payroll-runs/{run_id}/post", response_model=schemas.PayrollRunOut)
def post_payroll_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(models.PayrollRun).get(run_id)
    if not run:
        raise HTTPException(404, "Payroll run not found")
    if run.status == "Finalized":
        raise HTTPException(400, "This payroll run has already been posted")

    salaries_account = db.query(models.Account).filter(models.Account.name == "Salaries & Wages").first()
    bank_account = db.query(models.Account).filter(models.Account.name == "Bank").first()
    withholding_account = db.query(models.Account).filter(models.Account.name == "TDS/Withholding Payable").first()
    if not (salaries_account and bank_account and withholding_account):
        raise HTTPException(400, "Salaries & Wages, Bank, and TDS/Withholding Payable accounts are required in the Chart of Accounts")

    total_expense = sum(p.gross_pay + p.employer_contributions_total for p in run.payslips)
    total_net = sum(p.net_pay for p in run.payslips)
    total_withheld = sum(p.employee_deductions_total + p.employer_contributions_total for p in run.payslips)

    voucher_no = next_voucher_no(db, "Payment")
    entry = models.JournalEntry(
        voucher_no=voucher_no,
        voucher_type="Payment",
        date=run.run_date,
        narration=f"Payroll for {run.month}",
        payment_status="Paid",
    )
    db.add(entry)
    db.flush()
    db.add(models.JournalLine(journal_entry_id=entry.id, account_id=salaries_account.id, debit_amount=round(total_expense, 2), credit_amount=0))
    if total_net > 0:
        db.add(models.JournalLine(journal_entry_id=entry.id, account_id=bank_account.id, debit_amount=0, credit_amount=round(total_net, 2)))
    if total_withheld > 0:
        db.add(models.JournalLine(journal_entry_id=entry.id, account_id=withholding_account.id, debit_amount=0, credit_amount=round(total_withheld, 2)))

    run.status = "Finalized"
    run.journal_entry_id = entry.id
    db.commit()
    db.refresh(run)
    return _serialize_run(run)


@router.delete("/payroll-runs/{run_id}")
def delete_payroll_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(models.PayrollRun).get(run_id)
    if not run:
        raise HTTPException(404, "Payroll run not found")
    if run.status == "Finalized":
        raise HTTPException(400, "Cannot delete a finalized payroll run — it's already posted to the ledger")
    db.delete(run)
    db.commit()
    return {"ok": True}
