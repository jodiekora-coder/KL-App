# KL App

Home-screen web app for Kora Lawler Aesthetics: make a branded skincare routine video after a skin consultation.

- Runs entirely on the device. No patient details are entered or stored.
- Product photos stay in the browser on that device.
- Install: open the site in Safari, tap Share, then Add to Home Screen.

## Invoices (invoice.html)

Tap-to-add invoice maker in the KL Invoices style. Numbers continue from KL-2026-0419. No client details go on the invoice.

- The price list is NOT in this repo. It is loaded once on the iPad by pasting a private price list code, and can be edited in Settings.
- Invoices made are logged on the device only (localStorage). Nothing is uploaded.
- "Send or save PDF" opens the iPad share sheet (WhatsApp, Mail, Files).

## Clinic policies (policies.html)

Folders for each section of the KL Clinic Compliance Checklist. Upload a photo or PDF into any folder to keep it there.

- Uploaded documents are stored on the device only (IndexedDB). Nothing is uploaded or added to this public repo.
- "Back up all" opens the iPad share sheet to save copies to Files, iCloud Drive or Google Drive. Deleting the app deletes its stored documents, so back up regularly.

## Stock (stock.html) and order forms (orders.html)

Stock opens a small hub: the Stock list (the shared stock tracker) and Order forms.

Order forms: tap products and amounts, then the app makes a finished PDF order form to send.

- Health Exchange: their own blank order form (`ord/hx-form.png`) is filled in at the right lines, with the delivery option, the unlicensed medicine statement and the prescriber's signature. The product list (`ord/hx-catalogue.js`) has codes and names from the April 2026 price list only.
- SkinPen (Crown Aesthetics): no supplier form exists, so the app makes a Kora Lawler branded purchase order.
- Account code, delivery address, prescriber name and all prices are NOT in this repo. They load once on the iPad from a private setup code and are stored on the device only (localStorage). Signatures are only kept if the user ticks "Keep my signature on this iPad".
