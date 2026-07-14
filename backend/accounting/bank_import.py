"""Parse a bank statement (CSV or OFX/QFX) into plain transaction rows, and
match those rows against existing unreconciled Journal Lines on an account.
No external dependencies — plain text parsing, works fully offline."""
import csv
import datetime
import io
import re

DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d %b %Y", "%b %d %Y", "%Y%m%d"]

DATE_HEADERS = {"date", "transaction date", "value date", "posted date", "txn date"}
DESC_HEADERS = {"description", "narration", "particulars", "details", "memo", "name"}
AMOUNT_HEADERS = {"amount", "transaction amount"}
DEBIT_HEADERS = {"debit", "withdrawal", "debit amount", "money out", "withdrawal amount"}
CREDIT_HEADERS = {"credit", "deposit", "credit amount", "money in", "deposit amount"}


def _parse_date(value: str):
    value = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(value: str) -> float:
    cleaned = re.sub(r"[^\d.\-]", "", value.replace(",", ""))
    return float(cleaned) if cleaned not in ("", "-", ".") else 0.0


def parse_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    header_map = {h.strip().lower(): h for h in reader.fieldnames}

    def find(headers):
        for h in headers:
            if h in header_map:
                return header_map[h]
        return None

    date_col = find(DATE_HEADERS)
    desc_col = find(DESC_HEADERS)
    amount_col = find(AMOUNT_HEADERS)
    debit_col = find(DEBIT_HEADERS)
    credit_col = find(CREDIT_HEADERS)

    if not date_col:
        raise ValueError("Could not find a date column in this CSV")
    if not amount_col and not (debit_col or credit_col):
        raise ValueError("Could not find an amount (or debit/credit) column in this CSV")

    rows = []
    for raw in reader:
        date = _parse_date(raw.get(date_col, ""))
        if not date:
            continue
        description = (raw.get(desc_col) or "").strip() if desc_col else ""
        if amount_col:
            amount = _parse_amount(raw.get(amount_col, "0"))
        else:
            debit = _parse_amount(raw.get(debit_col, "0")) if debit_col else 0.0
            credit = _parse_amount(raw.get(credit_col, "0")) if credit_col else 0.0
            amount = credit - debit
        rows.append({"date": date, "description": description, "amount": round(amount, 2)})
    return rows


def parse_ofx(text: str) -> list[dict]:
    rows = []
    for block in re.findall(r"<STMTTRN>(.*?)</STMTTRN>", text, re.DOTALL | re.IGNORECASE):
        def field(tag):
            m = re.search(rf"<{tag}>([^<\r\n]+)", block, re.IGNORECASE)
            return m.group(1).strip() if m else ""

        raw_date = field("DTPOSTED")[:8]
        try:
            date = datetime.datetime.strptime(raw_date, "%Y%m%d").date()
        except ValueError:
            continue
        amount = _parse_amount(field("TRNAMT") or "0")
        description = field("NAME") or field("MEMO")
        rows.append({"date": date, "description": description, "amount": round(amount, 2)})
    return rows


def parse_statement(filename: str, text: str) -> list[dict]:
    lower = filename.lower()
    if lower.endswith(".ofx") or lower.endswith(".qfx") or "<STMTTRN>" in text.upper():
        return parse_ofx(text)
    return parse_csv(text)


def match_rows(unreconciled_lines: list, rows: list[dict], window_days: int = 5) -> list[dict]:
    """unreconciled_lines: list of (line_id, date, signed_amount) for is_cleared=False lines
    on the target account, where signed_amount = debit_amount - credit_amount."""
    used_line_ids = set()
    matched = []
    for row in rows:
        best = None
        for line_id, line_date, signed_amount in unreconciled_lines:
            if line_id in used_line_ids:
                continue
            if abs(signed_amount - row["amount"]) > 0.01:
                continue
            delta_days = abs((line_date - row["date"]).days)
            if delta_days > window_days:
                continue
            if best is None or delta_days < best[1]:
                best = (line_id, delta_days)
        if best:
            used_line_ids.add(best[0])
            matched.append({**row, "matched_line_id": best[0]})
        else:
            matched.append({**row, "matched_line_id": None})
    return matched
