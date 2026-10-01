# Architecture decisions

## One portal, one source of truth

旧版 Express + SQLite 和先前 Firebase prototype 不再平行维护。Firebase 是唯一 production source of truth。

## Role boundaries

- student: 自己的资料、报名、收据、抽牌、旅程
- staff: 查看报名、核对付款、点名、查看收据
- admin: staff 全部权限 + 月台、账号、角色、系统设置

Cloud Functions 每次请求都会读取 `users/{uid}.role`，所以敏感操作不会只依赖浏览器 UI 或 custom claims。

## Seat reservation invariant

会占席位的状态：

```text
pending_payment
paid
confirmed
attended
```

报名动作使用 Firestore transaction 同时更新 registration 与 station.reserved_count。

```text
open station
  ↓
reserved_count < capacity
  → pending_payment + seat_no + reserved_count + 1

reserved_count >= capacity
  → waitlist
```

取消已占位报名时释放席位，并尝试把最早的 waitlist 升为 pending_payment。

## Receipt privacy

Client upload path:

```text
receipts/{uid}/{registrationId}/{timestamp}-{filename}
```

Storage Rules 只允许 owner 上传。Staff/Admin 读取需角色 claim。Portal 后台主要通过 Cloud Function 产生短时 signed URL 打开收据。

## Why intentions are embedded

SQLite 版有单独 `intentions` table。Firestore 版把 intention 放进 registration：

```js
registration.intention = {
  reason,
  hopes,
  clarity,
  experience,
  language
}
```

原因：它天然属于“这一站的报名”，一起读取、一起保存，减少额外 query 与同步问题。

## Visual system

Portal 不沿用 UNIQorn 的雾蓝/情绪水彩语言。Healing Lemon UI 使用清澈、明亮、可行动的视觉：

```text
Yellow = 能量 / 当前 / CTA
Blue   = 清晰 / 导航 / 系统状态
White  = breathing space
Green  = 少量成长提示
Ning-Mon = 陪伴与状态反馈
```
