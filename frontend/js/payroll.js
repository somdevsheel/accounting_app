/* Payroll: Employees master, configurable deduction types, monthly Payroll Runs. */

const EmployeesView = (() => {
  let employeesCache = [];

  async function render(container) {
    employeesCache = await Api.listEmployees({ include_inactive: true });
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn" id="emp-add">+ Add Employee</button></div>
      ${employeesCache.length === 0 ? emptyState("🧑‍💼", "No employees yet", "Add employees to run payroll for them.") : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th class="num">Basic Salary</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${employeesCache.map((e) => `
              <tr>
                <td>${escapeHtml(e.name)}</td>
                <td>${escapeHtml(e.role || "")}</td>
                <td class="num">${fmtMoney(e.basic_salary)}</td>
                <td>${e.is_active ? '<span class="badge green">Active</span>' : '<span class="badge gray">Inactive</span>'}</td>
                <td>
                  <button class="btn secondary small emp-edit" data-id="${e.id}">Edit</button>
                  ${e.is_active
                    ? `<button class="btn secondary small emp-deactivate" data-id="${e.id}">Deactivate</button>`
                    : `<button class="btn secondary small emp-activate" data-id="${e.id}">Activate</button>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`}`;
    document.getElementById("emp-add").addEventListener("click", () => openModal(container));
    container.querySelectorAll(".emp-edit").forEach((btn) => btn.addEventListener("click", () => openModal(container, Number(btn.dataset.id))));
    container.querySelectorAll(".emp-deactivate").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.deactivateEmployee(Number(btn.dataset.id));
      toast("Employee deactivated");
      render(container);
    }));
    container.querySelectorAll(".emp-activate").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.activateEmployee(Number(btn.dataset.id));
      toast("Employee activated");
      render(container);
    }));
  }

  function openModal(container, employeeId) {
    const existing = employeeId ? employeesCache.find((e) => e.id === employeeId) : null;
    const html = `
      <div class="modal-header"><h2>${existing ? "Edit Employee" : "Add Employee"}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="form-grid">
        <div class="field" style="grid-column:span 2;"><label>Name</label><input type="text" id="e-name" value="${existing ? escapeHtml(existing.name) : ""}" /></div>
        <div class="field"><label>Role</label><input type="text" id="e-role" value="${existing ? escapeHtml(existing.role || "") : ""}" /></div>
        <div class="field"><label>Basic Salary (monthly)</label><input type="number" step="0.01" id="e-salary" value="${existing ? existing.basic_salary : 0}" /></div>
        <div class="field"><label>Email</label><input type="email" id="e-email" value="${existing ? escapeHtml(existing.email || "") : ""}" /></div>
        <div class="field"><label>Phone</label><input type="text" id="e-phone" value="${existing ? escapeHtml(existing.phone || "") : ""}" /></div>
        <div class="field"><label>Bank Account</label><input type="text" id="e-bank" value="${existing ? escapeHtml(existing.bank_account || "") : ""}" /></div>
        <div class="field"><label>Joining Date</label><input type="date" id="e-joined" value="${existing && existing.joining_date ? existing.joining_date : ""}" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn" id="e-save">${existing ? "Save Changes" : "Add Employee"}</button>
      </div>`;
    App.openModal(html);
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    document.getElementById("e-save").addEventListener("click", async () => {
      const payload = {
        name: document.getElementById("e-name").value.trim(),
        role: document.getElementById("e-role").value,
        basic_salary: Number(document.getElementById("e-salary").value) || 0,
        email: document.getElementById("e-email").value,
        phone: document.getElementById("e-phone").value,
        bank_account: document.getElementById("e-bank").value,
        joining_date: document.getElementById("e-joined").value || null,
      };
      if (!payload.name) { toast("Name is required", true); return; }
      try {
        if (existing) await Api.updateEmployee(existing.id, payload);
        else await Api.createEmployee(payload);
        toast("Employee saved");
        App.closeModal();
        render(container);
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  return { render };
})();

const PayrollView = (() => {
  let tab = "runs";
  let deductionTypesCache = [];
  let runsCache = [];

  async function render(container) {
    container.innerHTML = `
      <div class="tabs">
        <div class="tab ${tab === "runs" ? "active" : ""}" data-tab="runs">Payroll Runs</div>
        <div class="tab ${tab === "deductions" ? "active" : ""}" data-tab="deductions">Deduction Types</div>
      </div>
      <div id="payroll-body"></div>`;
    container.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => { tab = t.dataset.tab; render(container); }));
    const body = document.getElementById("payroll-body");
    if (tab === "runs") await renderRunsTab(body, container);
    else await renderDeductionsTab(body);
  }

  async function renderRunsTab(body, container) {
    runsCache = await Api.listPayrollRuns();
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    body.innerHTML = `
      <div class="toolbar">
        <div class="filters">
          <div><label>Month</label><input type="month" id="pr-month" value="${defaultMonth}" /></div>
        </div>
        <button class="btn" id="pr-run">Run Payroll</button>
      </div>
      ${runsCache.length === 0 ? emptyState("💵", "No payroll runs yet", "Add employees and (optionally) deduction types, then run payroll for a month.") : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Run Date</th><th class="num">Gross</th><th class="num">Net Pay</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${runsCache.map((r) => `
              <tr>
                <td>${r.month}</td><td>${fmtDate(r.run_date)}</td>
                <td class="num">${fmtMoney(r.total_gross)}</td><td class="num">${fmtMoney(r.total_net)}</td>
                <td>${r.status === "Finalized" ? '<span class="badge green">Finalized</span>' : '<span class="badge gray">Draft</span>'}</td>
                <td>
                  <button class="btn secondary small pr-view" data-id="${r.id}">View</button>
                  ${r.status === "Draft" ? `<button class="btn secondary small pr-post" data-id="${r.id}">Post to Ledger</button>
                  <button class="btn secondary small pr-delete" data-id="${r.id}">Delete</button>` : ""}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`}`;
    document.getElementById("pr-run").addEventListener("click", async () => {
      const month = document.getElementById("pr-month").value;
      if (!month) { toast("Pick a month", true); return; }
      try {
        const run = await Api.createPayrollRun({ month, run_date: todayStr() });
        toast("Payroll run created");
        viewRun(container, run.id);
      } catch (err) {
        toast(err.message, true);
      }
    });
    body.querySelectorAll(".pr-view").forEach((btn) => btn.addEventListener("click", () => viewRun(container, Number(btn.dataset.id))));
    body.querySelectorAll(".pr-post").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("Post this payroll run to the ledger? This cannot be undone.")) return;
      try {
        await Api.postPayrollRun(Number(btn.dataset.id));
        toast("Payroll posted to ledger");
        render(container);
      } catch (err) {
        toast(err.message, true);
      }
    }));
    body.querySelectorAll(".pr-delete").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("Delete this draft payroll run?")) return;
      await Api.deletePayrollRun(Number(btn.dataset.id));
      toast("Run deleted");
      render(container);
    }));
  }

  async function viewRun(container, runId) {
    const run = await Api.getPayrollRun(runId);
    const html = `
      <div class="modal-header"><h2>Payroll — ${run.month}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="table-wrap" style="max-height:420px;overflow-y:auto;">
        <table>
          <thead><tr><th>Employee</th><th class="num">Gross</th><th class="num">Deductions</th><th class="num">Employer Cost</th><th class="num">Net Pay</th></tr></thead>
          <tbody>
            ${run.payslips.map((p) => `
              <tr>
                <td>${escapeHtml(p.employee_name)}<div class="text-muted" style="font-size:0.75rem;">${p.deductions.map((d) => `${escapeHtml(d.name)}: ${fmtMoney(d.amount)} (${d.applies_to})`).join(", ") || "No deductions"}</div></td>
                <td class="num">${fmtMoney(p.gross_pay)}</td>
                <td class="num">${fmtMoney(p.employee_deductions_total)}</td>
                <td class="num">${fmtMoney(p.employer_contributions_total)}</td>
                <td class="num"><strong>${fmtMoney(p.net_pay)}</strong></td>
              </tr>`).join("")}
          </tbody>
          <tfoot><tr><td>Total</td><td class="num">${fmtMoney(run.total_gross)}</td><td colspan="2"></td><td class="num">${fmtMoney(run.total_net)}</td></tr></tfoot>
        </table>
      </div>
      ${run.status === "Draft" ? `<p class="text-muted" style="font-size:0.82rem;margin-top:10px;">Posting will debit Salaries &amp; Wages, credit Bank for net pay, and credit TDS/Withholding Payable for everything withheld.</p>` : `<p class="text-muted" style="font-size:0.82rem;margin-top:10px;">Posted to the ledger.</p>`}
      <div class="modal-actions">
        <button class="btn secondary" id="m-cancel">Close</button>
        ${run.status === "Draft" ? `<button class="btn" id="pr-post-modal">Post to Ledger</button>` : ""}
      </div>`;
    App.openModal(html, { wide: true });
    document.getElementById("m-close").addEventListener("click", App.closeModal);
    document.getElementById("m-cancel").addEventListener("click", App.closeModal);
    const postBtn = document.getElementById("pr-post-modal");
    if (postBtn) postBtn.addEventListener("click", async () => {
      try {
        await Api.postPayrollRun(run.id);
        toast("Payroll posted to ledger");
        App.closeModal();
        render(container);
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  async function renderDeductionsTab(body) {
    deductionTypesCache = await Api.listDeductionTypes();
    body.innerHTML = `
      <div class="card" style="max-width:640px;">
        <h3>Deduction &amp; Contribution Types</h3>
        <p class="text-muted" style="font-size:0.82rem;">"Employee" types are withheld from pay (e.g. income tax, provident fund). "Employer" types are a cost on top of salary that don't reduce the employee's net pay (e.g. employer PF contribution).</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Applies To</th><th>Calc</th><th></th></tr></thead>
            <tbody>
              ${deductionTypesCache.map((d) => `<tr><td>${escapeHtml(d.name)}</td><td>${d.applies_to}</td><td>${d.calc_type === "Percent" ? d.value + "%" : fmtMoney(d.value)}</td><td><button class="btn secondary small dt-del" data-id="${d.id}">Remove</button></td></tr>`).join("") || `<tr><td colspan="4" class="text-muted">No deduction types configured — payroll will run on gross salary only.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="form-grid" style="margin-top:12px;">
          <div class="field"><label>Name</label><input type="text" id="dt-name" placeholder="e.g. Provident Fund" /></div>
          <div class="field"><label>Applies To</label><select id="dt-applies"><option>Employee</option><option>Employer</option></select></div>
          <div class="field"><label>Calc Type</label><select id="dt-calc"><option>Percent</option><option>Fixed</option></select></div>
          <div class="field"><label>Value</label><input type="number" step="0.01" id="dt-value" /></div>
        </div>
        <div class="modal-actions" style="border-top:none;"><button class="btn" id="dt-add">Add</button></div>
      </div>`;
    body.querySelectorAll(".dt-del").forEach((btn) => btn.addEventListener("click", async () => {
      await Api.deleteDeductionType(Number(btn.dataset.id));
      toast("Removed");
      renderDeductionsTab(body);
    }));
    document.getElementById("dt-add").addEventListener("click", async () => {
      const name = document.getElementById("dt-name").value.trim();
      const value = Number(document.getElementById("dt-value").value);
      if (!name) { toast("Name is required", true); return; }
      await Api.createDeductionType({
        name, applies_to: document.getElementById("dt-applies").value,
        calc_type: document.getElementById("dt-calc").value, value: value || 0,
      });
      toast("Deduction type added");
      renderDeductionsTab(body);
    });
  }

  return { render };
})();
