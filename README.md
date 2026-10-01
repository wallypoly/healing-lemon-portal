# Healing Lemon 人生列车 Portal v2

这是把两套版本真正合成一套后的正式架构：

- 保留原 `life-train-portal` 已经成熟的业务流程：月台、报名、付款核对、抽牌、签到 Punch、成长印章、Staff/Admin 工作台。
- 底层统一改成 Firebase：Authentication + Firestore + Storage + Cloud Functions + Hosting。
- UI 全面改成 Healing Lemon：柠檬黄、清澈蓝、柔光白，并使用 Ning-Mon 官方角色素材。
- 不再需要 Express 常驻服务器、SQLite persistent disk、本地 uploads 或自制 token。

## 最终架构

```text
Firebase Hosting
  ├─ public/index.html
  ├─ public/login.html
  ├─ public/app.html
  └─ public/admin.html
          │
          ├─ Firebase Auth
          ├─ Cloud Functions /api
          ├─ Firestore
          └─ Firebase Storage
```

## 核心功能

- 学员注册 / 登录 / 忘记密码
- 月台与活动报名
- 付款资料与收据上传
- 抽牌记录
- Check-in / Punch
- 3 / 6 / 12 / 24 站成长里程碑
- Staff / Admin 工作台
- CSV 导出
- Firebase Rules / Storage Rules / Functions 权限验证

## UI

Healing Lemon 主色：
- Lemon Yellow `#FFE45E`
- Clear Blue `#2188F5`
- Deep Blue `#1668B8`
- Soft White `#F7FBFF`
- Leaf accent `#A7D18C`

Ning-Mon 作为 Portal 的品牌角色与旅程引导。

## 接上 Firebase

1. Firebase Console 开启 Authentication、Firestore、Storage、Hosting、Functions。
2. 将 `public/assets/firebase-config.example.js` 复制为 `public/assets/firebase-config.js` 并填入 Web App config。
3. 将 `.firebaserc.example` 复制为 `.firebaserc`，填入 Firebase project id。
4. 安装依赖：
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```
5. Seed：
   ```bash
   npm run seed
   ```
6. 检查：
   ```bash
   npm run check
   firebase emulators:start
   ```
7. 部署：
   ```bash
   firebase deploy
   ```

Functions region 预设为 `asia-southeast1`，适合马来西亚访问。

完整架构说明请看 `ARCHITECTURE.md`。
