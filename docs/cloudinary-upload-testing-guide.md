# Cloudinary upload API — testing guide (`/api/upload`)

Base URL:

```text
{{baseUrl}}/api
```

Recommended: set `{{baseUrl}} = http://localhost:3000`.

---

## 0) Prerequisites (env)

Add these to `.env.local` (preferred) or your deployment env:

```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Restart `npm run dev` after changing env vars.

---

## 1) Upload an image

- **POST** `{{baseUrl}}/api/upload`
- **Content-Type**: `multipart/form-data`
- **Body fields**:
  - `file` (**required**): the image file
  - `folder` (optional): Cloudinary folder (default: `earthquick`)

### Validation rules

- Allowed mime types: `image/jpeg`, `image/png`, `image/webp`
- Max size: 10MB

### Success response (200)

```json
{
  "success": true,
  "url": "https://res.cloudinary.com/.../image/upload/.../your-file.jpg",
  "public_id": "earthquick/abcd1234..."
}
```

### Common error responses

- 400: missing `file`, empty file
- 413: file too large
- 415: unsupported file type
- 500: Cloudinary config/upload failure

---

## 2) Delete an image

- **DELETE** `{{baseUrl}}/api/upload`
- **Content-Type**: `application/json`
- **Body**:

```json
{ "public_id": "earthquick/abcd1234..." }
```

### Success response (200)

```json
{ "success": true, "result": { "result": "ok" } }
```

Note: Cloudinary may return `"not found"` if the `public_id` doesn’t exist.

---

## 3) Test with Postman

### Upload

- Method: `POST`
- URL: `{{baseUrl}}/api/upload`
- Body → `form-data`
  - Key: `file` (type: File) → choose an image
  - Key: `folder` (type: Text) → `earthquick` (optional)

### Delete

- Method: `DELETE`
- URL: `{{baseUrl}}/api/upload`
- Body → `raw` → JSON:

```json
{ "public_id": "PASTE_PUBLIC_ID_FROM_UPLOAD_RESPONSE" }
```

---

## 4) Test with curl (Windows PowerShell friendly)

### Upload

```bash
curl -X POST "http://localhost:3000/api/upload" ^
  -F "file=@C:\path\to\image.jpg" ^
  -F "folder=earthquick"
```

### Delete

```bash
curl -X DELETE "http://localhost:3000/api/upload" ^
  -H "Content-Type: application/json" ^
  -d "{\"public_id\":\"earthquick/PASTE_PUBLIC_ID\"}"
```

---

## 5) Test in the browser (UI component)

You already have a test component at:

- `components/image-upload.tsx` (`ImageUpload`)

Render it on any page (temporary test page is fine), then:

- Select an image
- Click **Upload**
- Copy the `public_id` (used for delete/replace flows)

