# Healing Lemon 人生列车 Portal v2

这是把两套版本真正合成一套后的正式架构：

- 保留原 `life-train-portal` 已经成熟的业务流程：月台、报名、付款核对、抽牌、签到 Punch、成长印章、Staff/Admin 工作台。
- 底层统一改成 Firebase：Authentication + Firestore + Storage + Cloud Functions + Hosting。
- UI 全面改成 Healing Lemon：柠檬黄、清澈蓝、柔光白，并使用 Ning-Mon 官方角色四视图素材。
- 不再需要 Express 常驻服务器、SQLite persistent disk、本地 uploads 或自制 token。

## 最终架构

```text
Firebase Hosting
  ├─ public/index.html        公开首页
  ├─ public/login.html        登录 / 注册
  ├─ public/app.html          学员 Portal
  └─ public/admin.html        Staff / Admin
          │
          ├─ Firebase Auth
          │    └─ Email / Password + password reset
          │
          ├─ Cloud Functions /api
          │    ├─ 学员业务规则
          │    ├─ 报名席位 transaction
          │    ├─ 付款核对
          │    ├─ check-in / punch / badge
          │    └─ admin 权限与 CSV 导出
          │
          ├─ Firestore
          │    ├─ users
          │    ├─ stations
          │    ├─ registrations
          │    ├─ punches
          │    ├─ cardDraws
          │    ├─ badges
          │    ├─ userBadges
          │    ├─ settings
          │    └─ auditLog
          │
          └─ Firebase Storage
               └─ receipts/{uid}/{registrationId}/...
```

## 这版已经修掉的旧架构问题

1. 收据不再放在公开 `/uploads`。用户直接上传 Firebase Storage，读权限由 Storage Rules 控制；后台看收据时只发 5 分钟 signed URL。
2. Staff 不能建立或升级 Admin。创建账号、改角色、停用账号都强制 Admin。
3. 报名时即占位。`pending_payment / paid / confirmed / attended` 都计入保留席位，避免多人先报名后一起付款造成超卖。
4. 同一用户同一月台使用 deterministic registration id：`{uid}_{stationId}`。取消后重新报名会恢复同一笔资料，不会撞 unique constraint。
5. 登录改用 Firebase Auth。浏览器不再自己保存 `lt_token`，也不再写可被 JS 读取的 auth cookie。
6. 学员付款只允许 DuitNow / bank transfer。`free / cash` 等特殊状态由工作人员流程控制。
7. 加入 Firebase 的忘记密码与重设密码机制。
8. Firestore / Storage 默认禁止直接写业务数据，关键动作全部经过 Cloud Functions 再验证权限与规则。

## UI 方向

`public/assets/style.css` 后半段是 `Healing Lemon UI v2` 覆盖层。主色：

- Lemon Yellow `#FFE45E`
- Clear Blue `#2188F5`
- Deep Blue `#1668B8`
- Soft White `#F7FBFF`
- Leaf accent `#A7D18C`

Ning-Mon 素材来自项目提供的角色四视图，已拆成：

- `public/assets/ip/ningmon.webp`

> GitHub 只保存网站运行需要的 Ning-Mon 优化图，完整角色四视图保留在品牌资产库，避免把高分辨率 IP 素材暴露在公开仓库。

## 第一次接 Firebase

### 1. 建立 / 选择现有 Firebase project

Firebase Console 开启：

- Authentication → Email/Password
- Firestore Database
- Storage
- Hosting
- Functions

Functions 使用 `asia-southeast1`，比较适合马来西亚访问。

### 2. 填 Web App config

复制：

```text
public/assets/firebase-config.example.js
```

为：

```text
public/assets/firebase-config.js
```

然后把 Firebase Console → Project settings → Web App 的 config 填进去。

### 3. 绑定 project

```bash
cp .firebaserc.example .firebaserc
```

把 `YOUR_FIREBASE_PROJECT_ID` 换成实际 project id。

### 4. 安装依赖

```bash
npm install
cd functions && npm install && cd ..
```

### 5. Seed 基础资料

先取得 Application Default Credentials，之后：

```bash
npm run seed
```

若要同时建立第一位 Admin / Staff：

```bash
BOOTSTRAP_ADMIN_EMAIL="admin@example.com" \
BOOTSTRAP_ADMIN_PASSWORD="a-strong-password" \
BOOTSTRAP_ADMIN_NAME="Wallance" \
BOOTSTRAP_STAFF_EMAIL="staff@example.com" \
BOOTSTRAP_STAFF_PASSWORD="another-strong-password" \
BOOTSTRAP_STAFF_NAME="Eunice" \
npm run seed
```

没有预设测试密码账号，避免上线后遗留弱口令。

### 6. 本地检查

```bash
npm run check
firebase emulators:start
```

然后打开：

```text
http://127.0.0.1:5000
```

### 7. 部署

```bash
firebase deploy
```

## Firestore 数据设计

### users/{uid}

长期个人资料与角色。Email/Password 本身由 Firebase Auth 管。

### stations/{code}

月台。例如 `1026`。包含日期、票价、capacity、`reserved_count`、status。

### registrations/{uid}_{stationId}

一个学员一个月台只会有一笔。意向 `intention` 直接嵌在报名内，避免 Firestore 做关系型 join。

### punches/{uid}_{stationId}

同一站只可 check-in 一次。

### cardDraws/{uid}_{stationId}

同一站只可抽一次牌。

### userBadges/{uid}_{badgeId}

成长印章的核发记录。

## 当前成长里程碑

Seed 预设为 3 / 6 / 12 / 24 站：

- 3 站：启程旅人
- 6 站：持续旅人
- 12 站：成长旅人
- 24 站：领航旅人

可直接在 Firestore 的 `badges` collection 调整，不需要改前端。

## 还需要你提供的唯一项目级资料

代码已经留好 Firebase 接口，但真实上线前仍需要你现有 Firebase project 的 Web App config。它不是密码，也可以公开在网页前端；真正的数据安全由 Auth、Rules 与 Functions 权限控制。
