# Plinko 遊戲

這是一個使用現代網頁技術開發的 Plinko 遊戲專案。Plinko 是一款經典的遊戲，玩家將球從頂端放下，球會隨機彈跳，最終落在底部的某個得分區域。歡迎參與、學習與改進本專案！

## 特色

- 簡單直覺的遊戲介面
- 流暢的動畫效果
- 清晰的得分計算
- 可自訂難度或關卡（依專案實際功能調整）

## 安裝與使用

1. **下載專案**

   ```bash
   git clone https://github.com/ChenHom/plinko-game.git
   cd plinko-game
   ```

2. **安裝依賴套件**  
   根據專案使用的技術，請執行下列指令安裝相關依賴（假設使用 Node.js）：

   ```bash
   npm install
   ```

3. **啟動專案**

   ```bash
   npm start
   ```

   或依專案文件說明使用其他啟動方式。

4. **瀏覽遊戲**  
   打開瀏覽器並前往 [http://localhost:3000](http://localhost:3000) （或專案指定的網址）。

## 目錄結構

```
plinko-game/
│
├─ src/               # 原始碼
├─ public/            # 靜態資源
├─ package.json       # 專案設定（如為 Node.js 專案）
├─ README.md          # 專案說明
└─ ...
```

## 貢獻方式

歡迎任何形式的貢獻！  
請先 fork 本倉庫，建立分支進行修改，完成後發送 Pull Request。建議遵循下列流程：

1. Fork 倉庫
2. 建立分支（建議以功能/修正命名）
3. 提交修改
4. 發送 Pull Request

## 授權條款

本專案採用 MIT License，詳見 [LICENSE](LICENSE)。

## 聯絡方式

如有任何問題與建議，歡迎開 issue 或聯絡專案擁有者。

---

感謝您的參與與支持！

## 開發記錄

### codex/add-api-for-ball-drop-point-retrieval

- 新增 `/api/play` POST API，接收 `rowCount`，回傳隨機 `binIndex` 並簽章結果
- 更新 `PlinkoEngine` 支援使用後端提供的 `binIndex` 進行落球，並計算對應的中獎倍數、獲利和更新餘額
- 將 `riskLevel` 與 `betAmount` 一併傳送至 API，並在 Sidebar 與 Benchmark 頁面同步更新請求參數
- 新增 Vitest 單元測試，驗證 `/api/play` 回傳的 `binIndex` 範圍正確
- 新增 Playwright E2E 測試，用以模擬後端回傳 `binIndex` 並檢查前端正確落球與顯示對應獎勵
