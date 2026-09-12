# Slack HRMS — setup order

The new app talks to Salesforce directly. Nothing is hosted anywhere else.

There is a dependency loop to get right: **the manifest needs the Site URL, and
the signing secret only exists once the app is created.** So the order is Site
first, app second, secret third.

---

## 1. Create the Salesforce Site

**Setup → Sites → New**

| Field | Value |
|---|---|
| Site Label | `HRMS Slack` |
| Site Name | `HRMS_Slack` |
| Default Web Address | `slack` |
| Active | ticked |
| Active Site Home Page | any page, it is never shown |

Save. Salesforce shows the site URL, something like:

```
https://orgfarm-7f6d730097-dev-ed.develop.my.site.com/slack
```

**That URL is what everything else needs.**

## 2. Let the site reach the gateway class

**Setup → Sites → HRMS Slack → Public Access Settings → Enabled Apex Class
Access → Edit**

Add **`SlackGatewayRest`**. Without this the endpoint answers 403 to Slack and
nothing else works.

Nothing else needs adding. The gateway identifies people from the signed Slack
payload, never from the guest user, and the guest owns nothing.

## 3. Create the Slack app from the manifest

Open `manifest-slack-hrms.json`, replace every **`SALESFORCE-SITE-URL`** with the
host from step 1, then:

**api.slack.com/apps → Create New App → From a manifest → paste**

That sets all eight URLs at once: six slash commands, interactivity, and events.
Doing it by hand means eight chances to mistype.

## 4. Put the signing secret into Salesforce

**Slack app → Basic Information → App Credentials → Signing Secret → Show**

Then in Salesforce:

**Setup → Custom Settings → Slack Config → Manage → New**

| Field | Value |
|---|---|
| Slack Signing Secret | the value from Slack |
| Gateway Enabled | ticked |

The gateway refuses every request until this exists, which is why deploying the
class does not by itself open a public endpoint.

## 5. Install and verify

Install the app to the workspace. Slack verifies the events URL as part of this
and will show it green when the challenge is echoed back.

Then `/myleave` in Slack.

---

## Why the order cannot change

```
Site URL ──► manifest ──► Slack app ──► signing secret ──► Salesforce
```

The manifest carries the URLs, so it needs the Site first. The signing secret is
generated when the app is created, so it comes after. Nothing here can be done
earlier than it appears.

## What stays running throughout

The existing **CloudSheer HRMS** app keeps pointing at the hosted gateway and
keeps working. Both apps can live in the workspace at once, which is what makes
this switchable rather than a cutover. Retire the old one only when the new one
has been used for real.
