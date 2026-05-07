# Preparedness Tasks — End-to-End API Flow (No `/v1`)

Base URL:

```text
http://localhost:3000/api
```

These endpoints use **cookie session auth** (`session` cookie set by `/api/login`). In Postman, login once per role and keep cookies.

---

## 0) Login (required for all role APIs)

### Request

**POST** `/login`

```json
{
  "email": "YOUR_EMAIL",
  "password": "YOUR_PASSWORD"
}
```

### Response (example)

```json
{
  "success": true,
  "user": {
    "email": "YOUR_EMAIL",
    "name": "Name",
    "role": "super-admin",
    "accountStatus": "approved"
  }
}
```

> Important: The `session` cookie is returned via `Set-Cookie`. Postman must store and send it.

---

## 1) Seed / Get Preparedness Guides (Boxes)

Guides are stored in `preparednessguides` (Mongoose `PreparednessGuide`).

### 1.1 Public list (auto-seeds when empty)

**GET** `/preparedness-guides`

#### Response (example)

```json
[
  { "_id": "GUIDE_ID_1", "category": "individual_evacuation", "order": 1, "createdAt": "...", "updatedAt": "..." },
  { "_id": "GUIDE_ID_2", "category": "community_evacuation", "order": 2, "createdAt": "...", "updatedAt": "..." }
]
```

### 1.2 Admin-shaped map (auto-seeds when empty)

**GET** `/admin/preparedness-guides`

#### Response (example)

```json
{
  "success": true,
  "data": {
    "individual_evacuation": { "id": "GUIDE_ID_1", "category": "individual_evacuation", "order": 1 },
    "community_evacuation": { "id": "GUIDE_ID_2", "category": "community_evacuation", "order": 2 }
  }
}
```

You’ll use `data.<category>.id` as **`preparednessId`** in task APIs.

---

## 2) Super Admin — Source Tasks (`tasks` collection)

Endpoints live under `/admin/preparedness-tasks`.

> ✅ You can also use the unified endpoint for **both** super-admin and sub-admin:
>
> - `POST /preparedness-tasks`
> - `PUT /preparedness-tasks`
> - `DELETE /preparedness-tasks`
> - `POST /preparedness-tasks/send`
>
> It automatically chooses the behavior based on the logged-in user’s role.

### 2.1 Create tasks (single or multiple)

**POST** `/admin/preparedness-tasks`

#### Body (multiple)

```json
{
  "preparednessId": "PREPAREDNESS_GUIDE_ID",
  "tasks": [
    { "title": "Task A" },
    { "title": "Task B" }
  ]
}
```

#### Response (example)

```json
{
  "success": true,
  "data": [
    {
      "_id": "TASK_ID_A",
      "preparednessId": "PREPAREDNESS_GUIDE_ID",
      "title": "Task A",
      "createdBy": "super_admin",
      "createdByUserId": "SUPER_ADMIN_USER_ID",
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "count": 2
}
```

### 2.2 Get tasks by preparedness guide

**GET** `/admin/preparedness-tasks?preparednessId=PREPAREDNESS_GUIDE_ID`

#### Response (example)

```json
{
  "success": true,
  "data": [
    {
      "_id": "TASK_ID_A",
      "preparednessId": "PREPAREDNESS_GUIDE_ID",
      "title": "Task A",
      "createdBy": "super_admin",
      "createdByUserId": "SUPER_ADMIN_USER_ID",
      "isActive": true
    }
  ]
}
```

### 2.3 Update tasks (batch)

**PUT** `/admin/preparedness-tasks`

```json
{
  "updates": [
    { "taskId": "TASK_ID_A", "title": "Task A (updated)" },
    { "taskId": "TASK_ID_B", "title": "Task B (updated)" }
  ]
}
```

#### Response (example)

```json
{
  "success": true,
  "results": [
    { "taskId": "TASK_ID_A", "ok": true },
    { "taskId": "TASK_ID_B", "ok": true }
  ]
}
```

### 2.4 Delete tasks (batch soft-delete)

**DELETE** `/admin/preparedness-tasks`

```json
{
  "taskIds": ["TASK_ID_A", "TASK_ID_B"]
}
```

#### Response (example)

```json
{
  "success": true,
  "matched": 2,
  "modified": 2
}
```

### 2.5 Update / delete a single task by id

- **PUT** `/admin/preparedness-tasks/TASK_ID`
- **DELETE** `/admin/preparedness-tasks/TASK_ID`

### 2.6 Send super-admin tasks to sub-admins

This upserts into `subadmin_tasks` (linked by `sourceTaskId`).

**POST** `/preparedness-tasks/send` (unified)

#### Body — send multiple tasks to **all** sub-admins

```json
{
  "taskIds": ["TASK_ID_A", "TASK_ID_B"]
}
```

#### Body — send to selected sub-admins (optional)

```json
{
  "taskIds": ["TASK_ID_A", "TASK_ID_B"],
  "subAdminIds": ["SUBADMIN_ID_1", "SUBADMIN_ID_2"]
}
```

#### Response (example)

```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "taskId": "TASK_ID_A",
        "recipients": [
          { "subAdminId": "SUBADMIN_ID_1", "upserted": true },
          { "subAdminId": "SUBADMIN_ID_2", "upserted": false }
        ]
      }
    ]
  }
}
```

---

## 3) Sub Admin — Local Layer (`subadmin_tasks`)

Endpoints live under `/subadmin/preparedness-tasks`.

### 3.1 Get this sub-admin’s tasks by preparedness guide

**GET** `/subadmin/preparedness-tasks?preparednessId=PREPAREDNESS_GUIDE_ID`

#### Response (example)

```json
{
  "success": true,
  "data": [
    {
      "_id": "SUBADMIN_TASK_ID",
      "subAdminId": "CURRENT_SUBADMIN_ID",
      "preparednessId": "PREPAREDNESS_GUIDE_ID",
      "sourceTaskId": "TASK_ID_A",
      "title": "Task A",
      "createdBy": "super_admin",
      "isDeletedBySubAdmin": false,
      "isActive": true
    }
  ]
}
```

### 3.2 Create sub-admin’s own tasks (multiple)

**POST** `/subadmin/preparedness-tasks`

```json
{
  "preparednessId": "PREPAREDNESS_GUIDE_ID",
  "tasks": [{ "title": "My Task 1" }, { "title": "My Task 2" }]
}
```

### 3.3 Update / delete (batch)

- **PUT** `/subadmin/preparedness-tasks`

```json
{
  "updates": [
    { "id": "SUBADMIN_TASK_ID", "title": "Updated title" }
  ]
}
```

- **DELETE** `/subadmin/preparedness-tasks`

```json
{
  "taskIds": ["SUBADMIN_TASK_ID_1", "SUBADMIN_TASK_ID_2"]
}
```

### 3.4 Update / delete (single)

- **PUT** `/subadmin/preparedness-tasks/SUBADMIN_TASK_ID`
- **DELETE** `/subadmin/preparedness-tasks/SUBADMIN_TASK_ID`

### 3.5 Send sub-admin tasks to end users (`user_tasks`)

**POST** `/subadmin/preparedness-tasks/send`

#### Option A — send many tasks to many users (Cartesian product)

```json
{
  "taskIds": ["SUBADMIN_TASK_ID_1", "SUBADMIN_TASK_ID_2"],
  "userIds": ["USER_ID_1", "USER_ID_2"],
  "description": "Optional message"
}
```

#### Option B — send to **all** users (omit `userIds`)

```json
{
  "taskIds": ["SUBADMIN_TASK_ID_1", "SUBADMIN_TASK_ID_2"]
}
```

#### Response (example)

```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "taskId": "SUBADMIN_TASK_ID_1",
        "recipients": [
          { "userId": "USER_ID_1", "ok": true },
          { "userId": "USER_ID_2", "ok": true }
        ]
      }
    ]
  }
}
```

---

## 4) End User — Delivered Tasks (`user_tasks`)

### 4.1 Get current user’s tasks

**GET** `/user/tasks`

#### Response (example)

```json
{
  "success": true,
  "data": [
    {
      "_id": "USER_TASK_ROW_ID",
      "userId": "CURRENT_USER_ID",
      "subAdminId": "SENDING_SUBADMIN_ID",
      "preparednessId": "PREPAREDNESS_GUIDE_ID",
      "taskId": "SUBADMIN_TASK_ID_1",
      "title": "Task A",
      "description": "Optional message",
      "sentAt": "2026-05-07T..."
    }
  ]
}
```

---

## 5) Combined endpoint — Preparedness with tasks (role-based)

### 5.1 Logged-in user (super-admin / sub-admin / user)

**GET** `/preparedness-with-tasks`

#### Response (example)

```json
{
  "success": true,
  "role": "super-admin",
  "data": [
    {
      "_id": "PREPAREDNESS_GUIDE_ID",
      "category": "individual_evacuation",
      "tasks": [
        { "_id": "TASK_ID_A", "title": "Task A", "createdBy": "super_admin", "isActive": true }
      ]
    }
  ]
}
```

### 5.2 Super-admin-only shortcut

Use the same endpoint as everyone else:

**GET** `/preparedness-with-tasks`

---

## Notes (Save button behavior)

When an admin/sub-admin edits in UI (add + edit + delete) and clicks **Save**:\n
- **Creates** → `POST .../preparedness-tasks` (new items)\n
- **Updates** → `PUT .../preparedness-tasks` (batch updates)\n
- **Deletes** → `DELETE .../preparedness-tasks` (batch soft-delete)\n

That’s how new + edit + delete are applied in one “save” action.

