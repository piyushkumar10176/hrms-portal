#!/usr/bin/env python3
"""
Link Slack accounts to Employee__c records by email.

Reads every member of the Slack workspace, matches each one to an active
employee on Official_Email__c, and writes the Slack member id to
Employee__c.Slack_User_Id__c.

Matching is by email because that is the only field both systems share. It is
case-insensitive. Employees whose HR email does not exist in Slack are reported
and skipped rather than guessed at.

Usage:
    python3 scripts/map-slack-users.py --token xoxb-... --team T0BV8DT6LKG [--apply]

Without --apply it prints what it would do and changes nothing.
"""

import argparse
import json
import subprocess
import sys
import urllib.request

SF_ORG = "hrms-org"


def slack_members(token: str, team_id: str):
    url = f"https://slack.com/api/users.list?limit=200&team_id={team_id}"
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(request) as response:
        payload = json.load(response)
    if not payload.get("ok"):
        sys.exit(f"Slack users.list failed: {payload.get('error')}")
    members = {}
    for member in payload.get("members", []):
        if member.get("deleted") or member.get("is_bot") or member["id"] == "USLACKBOT":
            continue
        email = (member.get("profile") or {}).get("email")
        if email:
            members[email.strip().lower()] = member["id"]
    return members


def sf_query(soql: str):
    result = subprocess.run(
        ["sf", "data", "query", "--target-org", SF_ORG, "--query", soql, "--json"],
        capture_output=True, text=True,
    )
    return json.loads(result.stdout)["result"]["records"]


def sf_update(record_id: str, slack_id: str):
    subprocess.run(
        ["sf", "data", "update", "record", "--sobject", "Employee__c",
         "--record-id", record_id, "--values", f"Slack_User_Id__c='{slack_id}'",
         "--target-org", SF_ORG],
        capture_output=True, text=True, check=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True, help="Slack bot token")
    parser.add_argument("--team", required=True, help="Slack workspace id")
    parser.add_argument("--apply", action="store_true", help="write the changes")
    args = parser.parse_args()

    by_email = slack_members(args.token, args.team)
    employees = sf_query(
        "SELECT Id, Name, Official_Email__c, Slack_User_Id__c FROM Employee__c "
        "WHERE Employee_Status__c = 'Active'"
    )

    linked, already, unmatched = [], [], []
    for employee in employees:
        email = (employee.get("Official_Email__c") or "").strip().lower()
        slack_id = by_email.get(email)
        if not slack_id:
            unmatched.append(employee)
        elif employee.get("Slack_User_Id__c") == slack_id:
            already.append((employee, slack_id))
        else:
            linked.append((employee, slack_id))

    for employee, slack_id in linked:
        action = "LINK  " if args.apply else "WOULD "
        print(f"{action}{employee['Name']:<24} {employee['Official_Email__c']:<32} -> {slack_id}")
        if args.apply:
            sf_update(employee["Id"], slack_id)

    for employee, slack_id in already:
        print(f"OK    {employee['Name']:<24} already linked to {slack_id}")

    print(f"\nlinked: {len(linked)}  already: {len(already)}  no Slack account: {len(unmatched)}")
    if unmatched:
        print("\nNo Slack account found for these employees:")
        for employee in unmatched:
            print(f"  {employee['Name']:<24} {employee.get('Official_Email__c')}")
    if not args.apply and linked:
        print("\nRe-run with --apply to write these.")


if __name__ == "__main__":
    main()
