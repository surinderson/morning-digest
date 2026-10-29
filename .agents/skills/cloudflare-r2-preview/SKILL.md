---
name: cloudflare-r2-preview
description: Publish or replace one self-contained HTML review preview in Cloudflare R2 at a stable public HTTPS URL, then remove its marker or delete the object. Use for short-lived course previews, not general app deployments.
---

# Cloudflare R2 review preview

Use a single R2 object key for the preview so the reviewer keeps the same URL when the file is replaced. Keep the HTML outside the Git repository, issue bodies, and chat attachments. The preview may contain only the template's sample data and its lane marker; never put credentials in it.

## Access and public changes

- Use an existing Cloudflare account owned by the human. Do not create an account or set up billing.
- If Wrangler is missing, ask before installing it. Do not put Cloudflare credentials in the repository; authenticate through Wrangler's browser sign-in and let the human complete the sign-in.
- Ask before creating a bucket, enabling its public `r2.dev` URL, uploading or replacing the HTML, or deleting the object. State the bucket and key, why the page is needed, that anyone with the URL can view it, any known cost exposure, and how to remove it. Wait for approval before the action.
- Keep the bucket private until public access is approved. Use the R2 Standard class and a dedicated bucket for this preview.

## Export and publish

1. Start the app from the repository root with `corepack pnpm start`. The template loads `.env`, including `LANE_MARKER`.
2. Save the rendered route with a command, outside the repository:

   ```powershell
   curl.exe --fail --silent --show-error http://localhost:8787/digest/2026-10-28 --output C:\Projects\morning-digest-preview.html
   ```

3. Check that the saved file is one HTML document with inline `<style>`, the expected sample rows, and the lane marker. Do not use browser Save As.
4. After approval, upload the file to the same object key each time:

   ```powershell
   npx wrangler r2 object put <bucket>/<key> --remote --file C:\Projects\morning-digest-preview.html --content-type text/html --cache-control no-store
   ```

5. Use the public bucket URL shown in the R2 dashboard and append the object key. Verify the HTTPS URL returns the HTML and the expected marker.

## Replace or remove

After the reviewer finishes, ask before the second public upload. Set `LANE_MARKER=` in `.env`, restart the app, export the route to the same local file, and upload it over the same bucket/key. Verify the original public URL now says `no marker set` and does not contain the old marker.

To take the object down, ask first, then run:

```powershell
npx wrangler r2 object delete <bucket>/<key> --remote
```

Verify the public object URL no longer returns the file. Do not disable public access for a bucket that contains other objects.

For current command flags, read [Wrangler R2 commands](https://developers.cloudflare.com/r2/reference/wrangler-commands/). For public URL setup and its limits, read [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).
