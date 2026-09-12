/**
 * HRMS admin console.
 *
 * Three tabs, for the three things that genuinely need a table rather than a
 * chat window: editing many employees at once, seeing everybody's attendance on
 * one day, and seeing who is off. Everything an admin does one person at a time
 * stays in Slack.
 */

import { LightningElement, wire, track } from "lwc";
import { refreshApex } from "@salesforce/apex";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import loadGrid from "@salesforce/apex/HrmsAdminController.loadGrid";
import applyToMany from "@salesforce/apex/HrmsAdminController.applyToMany";
import loadAttendance from "@salesforce/apex/HrmsAdminController.loadAttendance";
import loadLeave from "@salesforce/apex/HrmsAdminController.loadLeave";

const EMPLOYEE_COLUMNS = [
    { label: "Code", fieldName: "employeeCode", initialWidth: 95 },
    { label: "Name", fieldName: "name", wrapText: true },
    { label: "Email", fieldName: "email", type: "email", wrapText: true },
    { label: "Department", fieldName: "departmentName", wrapText: true },
    { label: "Designation", fieldName: "designationName", wrapText: true },
    { label: "Reports to", fieldName: "managerName", wrapText: true },
    { label: "Access", fieldName: "role", initialWidth: 100 },
    {
        label: "Needs attention", fieldName: "gaps", wrapText: true, initialWidth: 210,
        cellAttributes: { class: { fieldName: "gapClass" } }
    }
];

const ATTENDANCE_COLUMNS = [
    { label: "Code", fieldName: "employeeCode", initialWidth: 95 },
    { label: "Name", fieldName: "name", wrapText: true },
    { label: "Department", fieldName: "department", wrapText: true },
    { label: "In", fieldName: "checkIn", initialWidth: 80 },
    { label: "Out", fieldName: "checkOut", initialWidth: 80 },
    { label: "Break", fieldName: "breakLabel", initialWidth: 90 },
    { label: "Worked", fieldName: "workedLabel", initialWidth: 100 },
    { label: "Status", fieldName: "status", initialWidth: 110 },
    {
        label: "Flag", fieldName: "penaltyReason", wrapText: true,
        cellAttributes: { class: { fieldName: "flagClass" } }
    }
];

const LEAVE_COLUMNS = [
    { label: "Code", fieldName: "employeeCode", initialWidth: 95 },
    { label: "Name", fieldName: "name", wrapText: true },
    { label: "Department", fieldName: "department", wrapText: true },
    { label: "Type", fieldName: "leaveType", wrapText: true },
    { label: "From", fieldName: "fromDate", type: "date-local", initialWidth: 115 },
    { label: "To", fieldName: "toDate", type: "date-local", initialWidth: 115 },
    { label: "Days", fieldName: "daysLabel", initialWidth: 90 }
];

export default class HrmsEmployeeGrid extends LightningElement {
    // ---- employees -------------------------------------------------------
    @track allRows = [];
    @track rows = [];
    employeeColumns = EMPLOYEE_COLUMNS;
    includeInactive = false;
    onlyGaps = false;
    saving = false;
    error;

    /**
     * Bound to the table's selected-rows, which is what actually clears the
     * checkboxes. Tracking the ids alone left them ticked after an apply,
     * because nothing told the table its selection had gone.
     */
    @track selectedIds = [];

    departmentChoice;
    designationChoice;
    managerChoice;
    roleChoice;

    departmentOptions = [];
    designationOptions = [];
    managerOptions = [];
    roleOptions = [];
    wiredGrid;

    // ---- attendance ------------------------------------------------------
    attendanceColumns = ATTENDANCE_COLUMNS;
    @track attendanceRows = [];
    attendanceDate = null;
    attendanceSummary = {};
    wiredAttendance;

    // ---- leave -----------------------------------------------------------
    leaveColumns = LEAVE_COLUMNS;
    @track awayRows = [];
    @track remoteRows = [];
    @track upcomingRows = [];
    leaveDate = null;
    wiredLeave;

    // ======================================================================
    @wire(loadGrid, { includeInactive: "$includeInactive" })
    handleGrid(result) {
        this.wiredGrid = result;
        const { data, error } = result;
        if (data) {
            this.error = undefined;
            this.allRows = data.employees.map((row) => this.decorate(row));
            this.departmentOptions = this.toOptions(data.departments);
            this.designationOptions = this.toOptions(data.designations);
            this.managerOptions = this.toOptions(data.managers);
            this.roleOptions = this.toOptions(data.roles);
            this.applyFilter();
        } else if (error) {
            this.error = this.readError(error);
            this.allRows = [];
            this.rows = [];
        }
    }

    @wire(loadAttendance, { forDate: "$attendanceDate" })
    handleAttendance(result) {
        this.wiredAttendance = result;
        const { data } = result;
        if (!data) return;
        this.attendanceRows = data.rows.map((row) => ({
            ...row,
            breakLabel: row.breakMinutes ? `${row.breakMinutes}m` : "—",
            workedLabel: row.workedHours != null ? `${row.workedHours.toFixed(2)}h` : "—",
            flagClass: row.penalty ? "slds-text-color_error" : ""
        }));
        this.attendanceSummary = {
            present: data.present,
            halfDay: data.halfDay,
            flagged: data.flagged,
            noShow: data.noShow,
            headcount: data.headcount,
            forDate: data.forDate
        };
    }

    @wire(loadLeave, { forDate: "$leaveDate" })
    handleLeave(result) {
        this.wiredLeave = result;
        const { data } = result;
        if (!data) return;
        const shape = (r) => ({ ...r, daysLabel: r.halfDay ? "0.5 (half)" : String(r.days ?? "") });
        this.awayRows = data.away.map(shape);
        this.remoteRows = data.remote.map(shape);
        this.upcomingRows = data.upcoming.map(shape);
    }

    // ---- employee helpers ------------------------------------------------
    toOptions(choices) {
        return (choices ?? []).map((c) => ({ label: c.label, value: c.value }));
    }

    /**
     * Adds the column that makes this screen worth opening.
     *
     * Somebody with no manager has nobody to approve their leave, and somebody
     * with no Slack link receives nothing at all. Neither is visible anywhere
     * until the person complains.
     */
    decorate(row) {
        const gaps = [];
        if (!row.departmentId) gaps.push("department");
        if (!row.designationId) gaps.push("designation");
        if (!row.managerId) gaps.push("manager");
        if (row.slackUnlinked) gaps.push("Slack link");
        if (row.neverSignedIn) gaps.push("portal access");
        return {
            ...row,
            gaps: gaps.join(", "),
            gapClass: gaps.length ? "slds-text-color_error" : ""
        };
    }

    applyFilter() {
        this.rows = this.onlyGaps ? this.allRows.filter((r) => r.gaps) : this.allRows;
    }

    get rowCount() { return this.allRows.length; }
    get gapCount() { return this.allRows.filter((r) => r.gaps).length; }
    get healthyCount() { return this.rowCount - this.gapCount; }
    get hasGaps() { return this.gapCount > 0; }
    get selectedCount() { return this.selectedIds.length; }
    get hasSelection() { return this.selectedIds.length > 0; }
    get nothingChosen() {
        return !this.departmentChoice && !this.designationChoice &&
               !this.managerChoice && !this.roleChoice;
    }
    get applyDisabled() { return !this.hasSelection || this.nothingChosen || this.saving; }
    get inactiveLabel() { return this.includeInactive ? "Showing everyone" : "Active only"; }
    get gapsLabel() { return this.onlyGaps ? "Showing gaps only" : "Showing all"; }
    get gapsVariant() { return this.onlyGaps ? "brand" : "neutral"; }
    get applyLabel() {
        return this.hasSelection ? `Apply to ${this.selectedCount}` : "Apply";
    }
    get selectionHint() {
        if (!this.hasSelection) return "Tick the people you want to change.";
        if (this.nothingChosen) return `${this.selectedCount} selected. Now choose what to set.`;
        return `${this.selectedCount} selected and ready to apply.`;
    }

    toggleInactive() {
        this.includeInactive = !this.includeInactive;
        this.clearSelection();
    }

    toggleGaps() {
        this.onlyGaps = !this.onlyGaps;
        this.applyFilter();
    }

    handleRowSelection(event) {
        this.selectedIds = event.detail.selectedRows.map((r) => r.recordId);
    }

    handleDepartment(e) { this.departmentChoice = e.detail.value; }
    handleDesignation(e) { this.designationChoice = e.detail.value; }
    handleManager(e) { this.managerChoice = e.detail.value; }
    handleRole(e) { this.roleChoice = e.detail.value; }

    clearChoices() {
        this.departmentChoice = undefined;
        this.designationChoice = undefined;
        this.managerChoice = undefined;
        this.roleChoice = undefined;
    }

    /** Clears both the tracked ids and the table's own ticks. */
    clearSelection() {
        this.selectedIds = [];
    }

    async handleApply() {
        this.saving = true;
        const count = this.selectedCount;
        try {
            const failures = await applyToMany({
                employeeIds: this.selectedIds,
                departmentId: this.departmentChoice ?? null,
                designationId: this.designationChoice ?? null,
                managerId: this.managerChoice ?? null,
                role: this.roleChoice ?? null
            });

            if (failures.length === 0) {
                this.toast("Updated", `${count} employee${count === 1 ? "" : "s"} changed.`, "success");
                this.clearSelection();
                this.clearChoices();
            } else {
                this.toast(
                    `${failures.length} could not be saved`,
                    failures.join("\n"), "warning", "sticky"
                );
            }
            await refreshApex(this.wiredGrid);
        } catch (err) {
            this.toast("Nothing was changed", this.readError(err), "error", "sticky");
        } finally {
            this.saving = false;
        }
    }

    // ---- attendance ------------------------------------------------------
    get attendanceTitle() {
        return this.attendanceSummary.forDate
            ? `Attendance · ${this.attendanceSummary.forDate}`
            : "Attendance";
    }
    get hasAttendance() { return this.attendanceRows.length > 0; }
    handleAttendanceDate(e) { this.attendanceDate = e.detail.value || null; }
    attendanceToday() { this.attendanceDate = null; }

    // ---- leave -----------------------------------------------------------
    get awayCount() { return this.awayRows.length; }
    get remoteCount() { return this.remoteRows.length; }
    get upcomingCount() { return this.upcomingRows.length; }
    get hasAway() { return this.awayRows.length > 0; }
    get hasRemote() { return this.remoteRows.length > 0; }
    get hasUpcoming() { return this.upcomingRows.length > 0; }
    get everyoneIn() { return !this.hasAway && !this.hasRemote; }
    handleLeaveDate(e) { this.leaveDate = e.detail.value || null; }
    leaveToday() { this.leaveDate = null; }

    // ---- shared ----------------------------------------------------------
    /** Apex errors arrive in several shapes depending on how they were thrown. */
    readError(err) {
        if (!err) return "Unknown error";
        if (err.body?.message) return err.body.message;
        if (Array.isArray(err.body)) return err.body.map((e) => e.message).join(", ");
        return err.message ?? String(err);
    }

    toast(title, message, variant, mode = "dismissable") {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant, mode }));
    }
}
