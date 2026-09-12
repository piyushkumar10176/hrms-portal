/**
 * Bulk employee editor.
 *
 * This exists because Slack has no data grid. Setting the department on twelve
 * people, or filling in the roles that were never set, has no good answer in a
 * chat window. Everything else an admin does day to day is in Slack; this is for
 * the cases that genuinely need a table.
 *
 * Selection plus one action, rather than cell-by-cell editing: choosing twelve
 * rows and applying a department once is fewer decisions than twelve edits, and
 * it is the job people actually come here to do.
 */

import { LightningElement, wire, track } from "lwc";
import { refreshApex } from "@salesforce/apex";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import loadGrid from "@salesforce/apex/HrmsAdminController.loadGrid";
import applyToMany from "@salesforce/apex/HrmsAdminController.applyToMany";

const COLUMNS = [
    { label: "Code", fieldName: "employeeCode", initialWidth: 90 },
    { label: "Name", fieldName: "name", wrapText: true },
    { label: "Email", fieldName: "email", type: "email", wrapText: true },
    { label: "Department", fieldName: "departmentName", wrapText: true },
    { label: "Designation", fieldName: "designationName", wrapText: true },
    { label: "Reports to", fieldName: "managerName", wrapText: true },
    { label: "Access", fieldName: "role", initialWidth: 100 },
    { label: "Status", fieldName: "status", initialWidth: 90 },
    {
        label: "Missing", fieldName: "gaps", wrapText: true, initialWidth: 200,
        cellAttributes: { class: { fieldName: "gapClass" } }
    }
];

export default class HrmsEmployeeGrid extends LightningElement {
    @track rows = [];
    columns = COLUMNS;
    includeInactive = false;
    onlyGaps = false;
    saving = false;
    error;

    selectedIds = [];
    departmentChoice;
    designationChoice;
    managerChoice;
    roleChoice;

    departmentOptions = [];
    designationOptions = [];
    managerOptions = [];
    roleOptions = [];

    wiredResult;
    allRows = [];

    @wire(loadGrid, { includeInactive: "$includeInactive" })
    handleGrid(result) {
        this.wiredResult = result;
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

    toOptions(choices) {
        return (choices ?? []).map((c) => ({ label: c.label, value: c.value }));
    }

    /**
     * Adds the derived column that makes this screen worth opening.
     *
     * Somebody with no manager has nobody to approve their leave, and somebody
     * with no Slack account linked receives no notification at all. Both are
     * invisible until a person complains, so they are surfaced here.
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
    get applyLabel() {
        return this.hasSelection ? `Apply to ${this.selectedCount} selected` : "Apply";
    }

    toggleInactive() {
        this.includeInactive = !this.includeInactive;
        this.selectedIds = [];
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

    /**
     * Applies the chosen values to every selected row.
     *
     * Partial success is handled deliberately: rows that saved keep their
     * changes and the failures are named, rather than discarding the lot
     * because one row broke a validation rule.
     */
    async handleApply() {
        this.saving = true;
        try {
            const failures = await applyToMany({
                employeeIds: this.selectedIds,
                departmentId: this.departmentChoice ?? null,
                designationId: this.designationChoice ?? null,
                managerId: this.managerChoice ?? null,
                role: this.roleChoice ?? null
            });

            if (failures.length === 0) {
                this.toast(
                    "Updated",
                    `${this.selectedCount} employee${this.selectedCount === 1 ? "" : "s"} changed.`,
                    "success"
                );
                this.selectedIds = [];
                this.clearChoices();
            } else {
                this.toast(
                    `${failures.length} could not be saved`,
                    failures.join("\n"),
                    "warning",
                    "sticky"
                );
            }
            await refreshApex(this.wiredResult);
        } catch (err) {
            this.toast("Nothing was changed", this.readError(err), "error", "sticky");
        } finally {
            this.saving = false;
        }
    }

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
