# Preparedness tasks API — testing guide (`/api`)

Base URL:

```text
{{baseUrl}}/api
```

Recommended: set `{{baseUrl}} = http://localhost:3000`.

---

## 1. Login (cookies)

These APIs use the `session` cookie (JWT). In Postman:

- **POST** `{{baseUrl}}/api/login`
- Body:

```json
{ "email": "your@email.com", "password": "your-password" }
```

After login, Postman must keep cookies for `localhost`.

Roles used:

- `super-admin` → `/api/admin/...`
- `sub-admin` → `/api/subadmin/...`
- `user` → `/api/user/...`

---

## 2. Seed preparedness guides (if empty)

- **GET** `{{baseUrl}}/api/preparedness-guides`
- **GET** `{{baseUrl}}/api/admin/preparedness-guides`

Copy any guide `_id` as `preparednessId`.

---

## 3. Super-admin (source tasks)

Preferred unified endpoint:

- **POST** `{{baseUrl}}/api/preparedness-tasks` (works for `super-admin` and `sub-admin` based on role)

Legacy (still works):

- **POST** `{{baseUrl}}/api/admin/preparedness-tasks`

```json
{
  "preparednessId": "PREPAREDNESS_ID",
  "tasks": [{ "title": "Task A" }, { "title": "Task B" }]
}
```

- **GET** `{{baseUrl}}/api/admin/preparedness-tasks?preparednessId=PREPAREDNESS_ID`
- **POST** `{{baseUrl}}/api/preparedness-tasks/send` (unified send; role-based)

---

## 4. Sub-admin

Preferred unified endpoint:

- **POST** `{{baseUrl}}/api/preparedness-tasks` (role-based)
- **POST** `{{baseUrl}}/api/preparedness-tasks/send` (role-based)

Legacy (still works):

- **GET** `{{baseUrl}}/api/subadmin/preparedness-tasks?preparednessId=PREPAREDNESS_ID`
- **POST** `{{baseUrl}}/api/subadmin/preparedness-tasks`
- **POST** `{{baseUrl}}/api/subadmin/preparedness-tasks/send`

---

## 5. End user

- **GET** `{{baseUrl}}/api/user/tasks`

---

## 6. Preparedness with tasks

- **GET** `{{baseUrl}}/api/preparedness-with-tasks`

