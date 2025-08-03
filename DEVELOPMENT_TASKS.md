# Plinko 遊戲開發任務清單

---
### 【riskLevel 影響範圍註記】

1. 決定賠率表：不同 riskLevel 會選用不同的 binPayouts，直接影響每個落點的獎勵倍數。
2. 決定 RTP 計算：RTPController 依據 riskLevel 計算理論 RTP，影響長期回報率。
3. 影響動畫速度：PlinkoEngine 根據 riskLevel 調整球動畫速度，提升遊戲體驗。
4. 風控策略：後端根據投注金額自動選擇 riskLevel，防止大額投注出現極端高倍數。
5. 安全性：riskLevel 屬於關鍵參數，必須由後端決定，前端不得干涉。

// 相關程式碼註記：
// - binPayouts[rowCount][riskLevel][binIndex]
// - RTPController.calculateOptimalBinIndex(..., riskLevel, ...)
// - PlinkoEngine.getAnimationDuration() 依據 riskLevel 調整速度
// - getPlayerConfig(betAmount) 決定 riskLevel
---

## 任務 1: 建立精確 RTP 控制系統

### 任務描述
建立一個精確的 RTP (Return to Player) 控制系統，能夠根據設定的目標 RTP 百分比動態調整球的落點機率分佈，確保長期遊戲結果符合預期的回報率。

### 功能需求
1. 建立 `RTPController` 類別，實作精確的 RTP 計算邏輯
2. 實作迭代演算法調整機率權重，使期望值趨近目標 RTP
3. 支援風控機制，針對大額投注降低高倍數機率
4. 提供可配置的目標 RTP 參數

### 驗收標準
- [ ] RTP 控制器能根據目標 RTP (如 97%) 計算最佳落點機率
- [ ] 迭代演算法在 100 次內收斂到誤差 ±0.1% 範圍
- [ ] 風控機制對大額投注 (>100) 能降低極高倍數 (>50x) 機率
- [ ] 支援不同風險等級 (LOW/MEDIUM/HIGH) 的 RTP 調整
- [ ] 長期測試 (1000+ 次投球) RTP 收斂到目標值 ±1%

### 測試方法

#### 測試 1: 正常通過測試
```javascript
// 測試目標 RTP 97% 的機率計算正確性
const controller = new RTPController();
const binIndex = controller.calculateOptimalBinIndex(16, 'MEDIUM', 0.97, 10);
expect(binIndex).toBeGreaterThanOrEqual(0);
expect(binIndex).toBeLessThanOrEqual(16);

// 模擬 1000 次投球，驗證 RTP 收斂性
const results = [];
for (let i = 0; i < 1000; i++) {
  results.push(controller.calculateOptimalBinIndex(16, 'MEDIUM', 0.97, 10));
}
const actualRTP = calculateActualRTP(results, 16, 'MEDIUM');
expect(actualRTP).toBeCloseTo(0.97, 1); // 誤差在 ±1% 內
```

#### 測試 2: 失敗測試
```javascript
// 測試無效參數應該拋出錯誤
expect(() => {
  controller.calculateOptimalBinIndex(-1, 'INVALID', 0.97, 10);
}).toThrow('無效的參數');

// 測試極端 RTP 值應該被限制
expect(() => {
  controller.calculateOptimalBinIndex(16, 'MEDIUM', 2.0, 10); // 200% RTP 不合理
}).toThrow('RTP 值超出合理範圍');
```

#### 測試 3: Critical Test (關鍵測試)
```javascript
// 測試大額投注的風控機制
const normalBet = controller.calculateOptimalBinIndex(16, 'HIGH', 0.97, 10);
const largeBet = controller.calculateOptimalBinIndex(16, 'HIGH', 0.97, 1000);

// 大額投注時，極高倍數格子的機率應該降低
const normalHighPayoutChance = calculateHighPayoutProbability(normalBet, 16, 'HIGH');
const largeHighPayoutChance = calculateHighPayoutProbability(largeBet, 16, 'HIGH');
expect(largeHighPayoutChance).toBeLessThan(normalHighPayoutChance);
```

### 範例程式碼

```typescript
// src/lib/utils/rtp-controller.ts
export class RTPController {
  private theoreticalRTP: Record<RowCount, Record<RiskLevel, number>>;

  constructor() {
    this.theoreticalRTP = this.calculateTheoreticalRTP();
  }

  /**
   * 根據目標 RTP 計算最佳落點
   */
  calculateOptimalBinIndex(
    rowCount: RowCount,
    riskLevel: RiskLevel,
    targetRTP: number = 0.97,
    betAmount: number = 1
  ): number {
    if (rowCount < 8 || rowCount > 16) {
      throw new Error('無效的參數');
    }
    if (targetRTP <= 0 || targetRTP > 1.5) {
      throw new Error('RTP 值超出合理範圍');
    }

    const payouts = binPayouts[rowCount][riskLevel];
    const adjustedWeights = this.calculateAdjustedWeights(payouts, targetRTP);
    const riskAdjustedWeights = this.applyRiskControl(adjustedWeights, payouts, betAmount);

    return this.weightedRandomSelect(riskAdjustedWeights);
  }

  /**
   * 計算調整後的機率權重
   */
  private calculateAdjustedWeights(payouts: number[], targetRTP: number): number[] {
    const binCount = payouts.length;
    const weights = new Array(binCount).fill(1);

    // 迭代調整權重
    for (let iteration = 0; iteration < 100; iteration++) {
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      const normalizedWeights = weights.map(w => w / totalWeight);

      const currentRTP = normalizedWeights.reduce((sum, weight, index) => {
        return sum + weight * payouts[index];
      }, 0);

      const rtpDiff = targetRTP - currentRTP;

      if (Math.abs(rtpDiff) < 0.001) break;

      // 調整權重
      for (let i = 0; i < binCount; i++) {
        const payoutMultiplier = payouts[i];
        if (rtpDiff > 0 && payoutMultiplier > targetRTP) {
          weights[i] *= 1.1;
        } else if (rtpDiff < 0 && payoutMultiplier < targetRTP) {
          weights[i] *= 1.1;
        }
      }
    }

    return weights;
  }

  /**
   * 應用風控機制
   */
  private applyRiskControl(weights: number[], payouts: number[], betAmount: number): number[] {
    const riskAdjustedWeights = [...weights];

    if (betAmount > 100) {
      const riskFactor = Math.min(betAmount / 1000, 0.8);

      payouts.forEach((payout, index) => {
        if (payout > 50) {
          riskAdjustedWeights[index] *= (1 - riskFactor);
        }
      });
    }

    return riskAdjustedWeights;
  }

  /**
   * 加權隨機選擇
   */
  private weightedRandomSelect(weights: number[]): number {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return i;
      }
    }

    return weights.length - 1;
  }
}
```

---

## 任務 2: 擴充後端 API 支援精確 RTP

### 任務描述
擴充現有的 `/api/play` 端點，整合 RTP 控制系統，接收更多遊戲參數（`riskLevel`、`betAmount`、`targetRTP`），並回傳完整的遊戲結果資訊。

### 功能需求
1. API 只接收非關鍵參數：`betAmount`、`gameId`（可選）
2. 後端自動從配置或玩家等級決定 `riskLevel`、`targetRTP`、`rowCount`
3. 整合 RTP 控制器計算最佳落點
4. 回傳完整遊戲結果：`binIndex`、`multiplier`、`payout`、`profit`、`signature`、`gameConfig`
5. 加強參數驗證與錯誤處理
6. 實作詳細的請求/回應日誌

### 驗收標準
- [ ] API 只接收非關鍵參數，所有遊戲邏輯參數由後端決定
- [ ] 後端根據玩家等級/設定自動決定 `riskLevel`、`targetRTP`、`rowCount`
- [ ] 整合 RTP 控制器計算精確落點
- [ ] 回傳資料包含完整的遊戲結果與使用的遊戲配置資訊
- [ ] HMAC 簽章驗證機制正常運作
- [ ] 錯誤處理涵蓋所有無效輸入情況
- [ ] 前端無法透過修改請求參數影響遊戲機率或落點

### 測試方法

#### 測試 1: 正常通過測試
```javascript
// 測試只傳送非關鍵參數的 API 呼叫
const response = await fetch('/api/play', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    betAmount: 10,
    gameId: 'game-session-123' // 可選的遊戲會話 ID
  })
});

const result = await response.json();
expect(response.status).toBe(200);
expect(result.binIndex).toBeGreaterThanOrEqual(0);
expect(result.binIndex).toBeLessThanOrEqual(result.gameConfig.rowCount);
expect(result.multiplier).toBeGreaterThan(0);
expect(result.signature).toBeDefined();
expect(result.gameConfig.riskLevel).toBeDefined(); // 後端決定的風險等級
expect(result.gameConfig.targetRTP).toBeDefined(); // 後端決定的目標 RTP
```

#### 測試 2: 失敗測試
```javascript
// 測試缺少必要參數
const response = await fetch('/api/play', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}) // 缺少 betAmount
});

expect(response.status).toBe(400);
const error = await response.json();
expect(error.error).toContain('參數錯誤');

// 測試試圖傳送關鍵參數應該被忽略
const response2 = await fetch('/api/play', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    betAmount: 10,
    riskLevel: 'HIGH', // 這個應該被忽略
    targetRTP: 0.99    // 這個應該被忽略
  })
});

const result2 = await response2.json();
expect(response2.status).toBe(200);
// 驗證後端使用自己的配置，而不是前端傳的值
expect(result2.gameConfig.riskLevel).not.toBe('HIGH'); // 後端決定的值
expect(result2.gameConfig.targetRTP).not.toBe(0.99);   // 後端決定的值
```

#### 測試 3: Critical Test (關鍵測試)
```javascript
// 測試簽章驗證機制與後端安全性
const response = await fetch('/api/play', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    betAmount: 1000,
    gameId: 'security-test-session'
  })
});

const result = await response.json();

// 驗證簽章（包含後端決定的配置）
const payload = JSON.stringify({
  binIndex: result.binIndex,
  betAmount: 1000,
  multiplier: result.multiplier,
  payout: result.payout,
  profit: result.profit,
  gameConfig: result.gameConfig,
  timestamp: result.timestamp
});

const expectedSignature = crypto
  .createHmac('sha256', SECRET_KEY)
  .update(payload)
  .digest('hex');

```

### 範例程式碼

```typescript
// src/routes/api/play/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { RTPController } from '$lib/utils/rtp-controller';
import { binPayouts } from '$lib/constants/game';
import type { RiskLevel, RowCount } from '$lib/types';

const SECRET_KEY = process.env.PLAY_RESULT_SECRET ?? 'dev-secret';
const rtpController = new RTPController();

// 玩家配置 - 實際應用中從資料庫或配置檔案讀取
interface PlayerConfig {
  riskLevel: RiskLevel;
  targetRTP: number;
  rowCount: RowCount;
  maxBetAmount: number;
}

function getPlayerConfig(betAmount: number): PlayerConfig {
  // 根據投注金額或玩家等級決定配置
  if (betAmount > 500) {
    return {
      riskLevel: 'LOW',    // 大額投注使用低風險
      targetRTP: 0.95,     // 較低的 RTP
      rowCount: 14,        // 較少的行數
      maxBetAmount: 1000
    };
  } else if (betAmount > 100) {
    return {
      riskLevel: 'MEDIUM',
      targetRTP: 0.97,
      rowCount: 16,
      maxBetAmount: 500
    };
  } else {
    return {
      riskLevel: 'HIGH',   // 小額投注可用高風險
      targetRTP: 0.98,     // 較高的 RTP
      rowCount: 16,
      maxBetAmount: 100
    };
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { betAmount, gameId } = await request.json();

    // 只驗證非關鍵參數
    if (typeof betAmount !== 'number' || betAmount <= 0) {
      return json({ error: '參數錯誤：投注金額無效' }, { status: 400 });
    }

    // 後端決定所有關鍵遊戲參數
    const playerConfig = getPlayerConfig(betAmount);

    // 投注金額限制檢查
    if (betAmount > playerConfig.maxBetAmount) {
      return json({
        error: `投注金額超過限制：最大 ${playerConfig.maxBetAmount}`
      }, { status: 400 });
    }

    // 使用後端配置的參數計算落點
    const binIndex = rtpController.calculateOptimalBinIndex(
      playerConfig.rowCount,
      playerConfig.riskLevel,
      playerConfig.targetRTP,
      betAmount
    );

    // 計算遊戲結果
    const multiplier = binPayouts[playerConfig.rowCount][playerConfig.riskLevel][binIndex];
    const payout = betAmount * multiplier;
    const profit = payout - betAmount;
    const timestamp = Date.now();

    // 產生簽章（包含遊戲配置）
    const payload = JSON.stringify({
      binIndex,
      betAmount,
      multiplier,
      payout,
      profit,
      gameConfig: playerConfig,
      gameId: gameId || null,
      timestamp
    });

    const signature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(payload)
      .digest('hex');

    // 記錄日誌
    console.log(`[API] Play request: betAmount=${betAmount}, gameId=${gameId}`);
    console.log(`[API] Game config: ${JSON.stringify(playerConfig)}`);
    console.log(`[API] Play result: binIndex=${binIndex}, multiplier=${multiplier}, profit=${profit}`);

    return json({
      binIndex,
      multiplier,
      payout,
      profit,
      signature,
      gameConfig: playerConfig,
      gameId: gameId || null,
      timestamp
    });

  } catch (error) {
    console.error('[API] Play error:', error);
    return json({ error: '伺服器錯誤' }, { status: 500 });
  }
};
```
      riskLevel,
      betAmount,
      multiplier,
      payout,
      profit,
      timestamp
    });

    const signature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(payload)
      .digest('hex');

    // 記錄日誌
    console.log(`[API] Play request: rowCount=${rowCount}, riskLevel=${riskLevel}, betAmount=${betAmount}, targetRTP=${targetRTP}`);
    console.log(`[API] Play result: binIndex=${binIndex}, multiplier=${multiplier}, profit=${profit}`);

    return json({
      binIndex,
      multiplier,
      payout,
      profit,
      signature,
      targetRTP,
      timestamp
    });

  } catch (error) {
    console.error('[API] Play error:', error);
    return json({ error: '伺服器錯誤' }, { status: 500 });
  }
};
```

---

## 任務 3: 前端錯誤處理與 API 整合

### 任務描述
更新前端的 API 呼叫邏輯，確保前端只傳送非關鍵參數（投注金額），加入完整的錯誤處理機制，並實作資料格式驗證，確保只有正確且完整的資料才會觸發後續的球動畫。

### 功能需求
1. 更新前端 API 呼叫，只傳送非關鍵參數（`betAmount`、`gameId`）
2. 移除前端對 `riskLevel`、`targetRTP`、`rowCount` 等關鍵參數的控制
3. 實作完整的錯誤處理與使用者提示
4. 加入 API 回應資料格式驗證
5. 實作重試機制處理暫時性網路問題
6. 加入載入狀態與錯誤狀態的 UI 回饋

### 驗收標準
- [ ] API 呼叫只包含非關鍵參數（betAmount、gameId）
- [ ] 前端無法控制任何影響遊戲機率的參數
- [ ] 遊戲配置資訊從後端回傳並正確顯示給使用者
- [ ] 錯誤處理涵蓋網路錯誤、伺服器錯誤、資料格式錯誤
- [ ] 重試機制在網路暫時性問題時自動重試最多 3 次
- [ ] 使用者介面能顯示載入、成功、錯誤狀態
- [ ] 錯誤狀態下不會觸發球動畫

### 測試方法

#### 測試 1: 正常通過測試
```javascript
// 測試只傳送非關鍵參數的 API 呼叫
const playGame = new PlayGameService();
const result = await playGame.requestBallDrop({
  betAmount: 10,
  gameId: 'test-session-123'
});

expect(result.success).toBe(true);
expect(result.data.binIndex).toBeGreaterThanOrEqual(0);
expect(result.data.signature).toBeDefined();
expect(result.data.gameConfig).toBeDefined(); // 後端決定的遊戲配置
expect(result.data.gameConfig.riskLevel).toBeDefined();
expect(result.data.gameConfig.targetRTP).toBeDefined();
expect(result.data.gameConfig.rowCount).toBeDefined();
```

#### 測試 2: 失敗測試
```javascript
// 模擬網路錯誤
global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

const playGame = new PlayGameService();
const result = await playGame.requestBallDrop({
  betAmount: 10
});

expect(result.success).toBe(false);
expect(result.error).toContain('網路連線失敗');

// 測試無效投注金額
const result2 = await playGame.requestBallDrop({
  betAmount: -10 // 無效金額
});

expect(result2.success).toBe(false);
expect(result2.error).toContain('投注金額無效');
```

#### 測試 3: Critical Test (關鍵測試)
```javascript
// 測試資料格式驗證與安全性
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    binIndex: 5,
    multiplier: 2.0,
    // 故意缺少 gameConfig 等重要欄位
    signature: 'invalid-signature'
  })
});

const playGame = new PlayGameService();
const result = await playGame.requestBallDrop({
  betAmount: 10
});

expect(result.success).toBe(false);
expect(result.error).toContain('回傳資料格式錯誤');

// 測試前端無法控制關鍵參數
const request = {
  betAmount: 10,
  riskLevel: 'HIGH',    // 這些參數應該被忽略
  targetRTP: 0.99,      // 這些參數應該被忽略
  rowCount: 8           // 這些參數應該被忽略
};

// 前端服務不應該傳送這些關鍵參數
const sanitizedRequest = playGame.sanitizeRequest(request);
expect(sanitizedRequest).toEqual({
  betAmount: 10
  // 其他關鍵參數應該被過濾掉
});
```
```

### 範例程式碼

```typescript
// src/lib/services/play-game.service.ts
export interface PlayGameRequest {
  betAmount: number;
  gameId?: string;
}

export interface GameConfig {
  riskLevel: string;
  targetRTP: number;
  rowCount: number;
  maxBetAmount: number;
}

export interface PlayGameResponse {
  binIndex: number;
  multiplier: number;
  payout: number;
  profit: number;
  signature: string;
  gameConfig: GameConfig;
  gameId: string | null;
  timestamp: number;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class PlayGameService {
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 秒

  /**
   * 過濾並清理請求參數，確保只傳送非關鍵參數
   */
  sanitizeRequest(request: any): PlayGameRequest {
    // 只保留非關鍵參數
    const sanitized: PlayGameRequest = {
      betAmount: request.betAmount
    };

    // 可選的非關鍵參數
    if (request.gameId && typeof request.gameId === 'string') {
      sanitized.gameId = request.gameId;
    }

    return sanitized;
  }

  async requestBallDrop(request: PlayGameRequest): Promise<ServiceResult<PlayGameResponse>> {
    let lastError: Error;

    // 驗證輸入參數
    if (!this.validateRequest(request)) {
      return {
        success: false,
        error: '投注金額無效'
      };
    }

    // 確保只傳送安全的參數
    const sanitizedRequest = this.sanitizeRequest(request);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch('/api/play', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(sanitizedRequest)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `伺服器錯誤: ${response.status}`);
        }

        const data = await response.json();

        // 驗證回傳資料格式
        if (!this.validateResponseData(data)) {
          throw new Error('回傳資料格式錯誤');
        }

        return {
          success: true,
          data
        };

      } catch (error) {
        lastError = error as Error;
        console.error(`API 呼叫失敗 (嘗試 ${attempt}/${this.maxRetries}):`, error);

        // 如果不是網路錯誤或已達最大重試次數，直接返回錯誤
        if (!this.isRetryableError(error as Error) || attempt === this.maxRetries) {
          break;
        }

        // 等待後重試
        await this.delay(this.retryDelay * attempt);
      }
    }

    return {
      success: false,
      error: this.getErrorMessage(lastError)
    };
  }

  private validateRequest(request: PlayGameRequest): boolean {
    return (
      typeof request.betAmount === 'number' &&
      request.betAmount > 0 &&
      request.betAmount <= 10000 // 前端基本限制
    );
  }

  private validateResponseData(data: any): data is PlayGameResponse {
    return (
      typeof data.binIndex === 'number' &&
      typeof data.multiplier === 'number' &&
      typeof data.payout === 'number' &&
      typeof data.profit === 'number' &&
      typeof data.signature === 'string' &&
      typeof data.timestamp === 'number' &&
      data.gameConfig &&
      typeof data.gameConfig.riskLevel === 'string' &&
      typeof data.gameConfig.targetRTP === 'number' &&
      typeof data.gameConfig.rowCount === 'number' &&
      typeof data.gameConfig.maxBetAmount === 'number'
    );
  }

  private isRetryableError(error: Error): boolean {
    // 網路連線錯誤、逾時錯誤等可重試
    return (
      error.message.includes('Network') ||
      error.message.includes('timeout') ||
      error.message.includes('ECONNRESET')
    );
  }

  private getErrorMessage(error: Error): string {
    if (error.message.includes('Network')) {
      return '網路連線失敗，請檢查網路連線後重試';
    }
    if (error.message.includes('timeout')) {
      return '請求逾時，請稍後再試';
    }
    if (error.message.includes('投注金額')) {
      return error.message;
    }
    if (error.message.includes('超過限制')) {
      return error.message;
    }
    return `發生錯誤：${error.message}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```
          const errorData = await response.json();
          throw new Error(errorData.error || `伺服器錯誤: ${response.status}`);
        }

        const data = await response.json();

        // 驗證回傳資料格式
        if (!this.validateResponseData(data)) {
          throw new Error('回傳資料格式錯誤');
        }

        return {
          success: true,
          data
        };

      } catch (error) {
        lastError = error as Error;
        console.error(`API 呼叫失敗 (嘗試 ${attempt}/${this.maxRetries}):`, error);

        // 如果不是網路錯誤或已達最大重試次數，直接返回錯誤
        if (!this.isRetryableError(error as Error) || attempt === this.maxRetries) {
          break;
        }

        // 等待後重試
        await this.delay(this.retryDelay * attempt);
      }
    }

    return {
      success: false,
      error: this.getErrorMessage(lastError)
    };
  }

  private validateResponseData(data: any): data is PlayGameResponse {
    return (
      typeof data.binIndex === 'number' &&
      typeof data.multiplier === 'number' &&
      typeof data.payout === 'number' &&
      typeof data.profit === 'number' &&
      typeof data.signature === 'string' &&
      typeof data.targetRTP === 'number' &&
      typeof data.timestamp === 'number'
    );
  }

  private isRetryableError(error: Error): boolean {
    // 網路連線錯誤、逾時錯誤等可重試
    return (
      error.message.includes('Network') ||
      error.message.includes('timeout') ||
      error.message.includes('ECONNRESET')
    );
  }

  private getErrorMessage(error: Error): string {
    if (error.message.includes('Network')) {
      return '網路連線失敗，請檢查網路連線後重試';
    }
    if (error.message.includes('timeout')) {
      return '請求逾時，請稍後再試';
    }
    if (error.message.includes('參數錯誤')) {
      return '遊戲參數錯誤，請重新整理頁面';
    }
    return `發生錯誤：${error.message}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 任務 4: PlinkoEngine 動畫路徑最佳化

### 任務描述
最佳化 PlinkoEngine 的球動畫系統，確保球能夠自然且精確地落到後端指定的 binIndex，同時保持視覺效果的流暢性和真實感。

### 功能需求
1. 實作精確的路徑計算，確保球最終落到指定格子
2. 加入物理運動的 easing function，使動畫更自然
3. 根據風險等級調整動畫速度與視覺效果
4. 實作動畫狀態管理，防止重複觸發
5. 加入動畫完成回調，更新遊戲狀態

### 驗收標準
- [ ] 球動畫能 100% 精確落到後端指定的 binIndex
- [ ] 動畫路徑符合物理運動特性，看起來自然
- [ ] 不同風險等級有不同的動畫速度與效果
- [ ] 動畫過程中不能被重複觸發
- [ ] 動畫完成後正確更新餘額和統計資料
- [ ] 動畫效能良好，不會造成頁面卡頓

### 測試方法

#### 測試 1: 正常通過測試
```javascript
// 測試動畫精確落點
const engine = new PlinkoEngine(canvas, config);
const targetBinIndex = 5;

engine.dropBall(targetBinIndex).then((result) => {
  expect(result.finalBinIndex).toBe(targetBinIndex);
  expect(result.animationCompleted).toBe(true);
});
```

#### 測試 2: 失敗測試
```javascript
// 測試無效 binIndex 應該拋出錯誤
const engine = new PlinkoEngine(canvas, config);

expect(() => {
  engine.dropBall(-1); // 無效的 binIndex
}).toThrow('無效的 binIndex');

expect(() => {
  engine.dropBall(99); // 超出範圍的 binIndex
}).toThrow('binIndex 超出範圍');
```

#### 測試 3: Critical Test (關鍵測試)
```javascript
// 測試動畫狀態管理 - 防止重複觸發
const engine = new PlinkoEngine(canvas, config);

// 第一個動畫正在進行
const firstDrop = engine.dropBall(3);

// 嘗試觸發第二個動畫應該被拒絕
expect(() => {
  engine.dropBall(5);
}).toThrow('動畫正在進行中');

// 等待第一個動畫完成
await firstDrop;

// 現在應該可以觸發新的動畫
expect(() => {
  engine.dropBall(5);
}).not.toThrow();
```

### 範例程式碼

```typescript
// src/lib/components/Plinko/PlinkoEngine.ts
export interface DropBallResult {
  finalBinIndex: number;
  animationCompleted: boolean;
  multiplier: number;
  payout: number;
  profit: number;
}

export interface BallPath {
  x: number;
  y: number;
  timestamp: number;
}

export class PlinkoEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: GameConfig;
  private isAnimating = false;
  private animationId: number | null = null;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.config = config;
  }

  /**
   * 投球並執行動畫到指定的 binIndex
   */
  async dropBall(targetBinIndex: number): Promise<DropBallResult> {
    if (this.isAnimating) {
      throw new Error('動畫正在進行中');
    }

    if (targetBinIndex < 0 || targetBinIndex > this.config.rowCount) {
      throw new Error('無效的 binIndex');
    }

    this.isAnimating = true;

    try {
      const ballPath = this.calculateOptimalPath(targetBinIndex);
      await this.animateBall(ballPath);

      const multiplier = binPayouts[this.config.rowCount][this.config.riskLevel][targetBinIndex];
      const payout = this.config.betAmount * multiplier;
      const profit = payout - this.config.betAmount;

      return {
        finalBinIndex: targetBinIndex,
        animationCompleted: true,
        multiplier,
        payout,
        profit
      };

    } finally {
      this.isAnimating = false;
    }
  }

  /**
   * 計算球的最佳路徑，確保落到目標格子
   */
  private calculateOptimalPath(targetBinIndex: number): BallPath[] {
    const path: BallPath[] = [];
    const startX = this.canvas.width / 2;
    const startY = 50;
    const endX = this.getBinCenterX(targetBinIndex);
    const endY = this.canvas.height - 100;

    // 計算路徑點，模擬球撞擊釘子的路徑
    const steps = this.config.rowCount * 4; // 增加路徑點密度
    const duration = this.getAnimationDuration();

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;

      // 使用三次貝茲曲線計算自然路徑
      const x = this.calculateBezierX(startX, endX, progress, targetBinIndex);
      const y = this.easeInOutCubic(progress) * (endY - startY) + startY;

      path.push({
        x,
        y,
        timestamp: progress * duration
      });
    }

    return path;
  }

  /**
   * 計算貝茲曲線 X 座標，模擬球的左右擺動
   */
  private calculateBezierX(startX: number, endX: number, progress: number, targetBinIndex: number): number {
    // 根據目標格子計算中間控制點，模擬真實的彈跳路徑
    const centerIndex = this.config.rowCount / 2;
    const deviation = (targetBinIndex - centerIndex) / centerIndex;

    // 計算中間控制點
    const midX1 = startX + (deviation * 0.3 * (endX - startX));
    const midX2 = startX + (deviation * 0.7 * (endX - startX));

    // 三次貝茲曲線
    const t = progress;
    const x = Math.pow(1 - t, 3) * startX +
              3 * Math.pow(1 - t, 2) * t * midX1 +
              3 * (1 - t) * Math.pow(t, 2) * midX2 +
              Math.pow(t, 3) * endX;

    // 加入微小的隨機擺動，增加真實感
    const randomOffset = (Math.random() - 0.5) * 10 * Math.sin(progress * Math.PI * 4);

    return x + randomOffset;
  }

  /**
   * 三次緩入緩出函數
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * 根據風險等級計算動畫持續時間
   */
  private getAnimationDuration(): number {
    const baseTime = 2000; // 基礎 2 秒

    switch (this.config.riskLevel) {
      case 'LOW':
        return baseTime * 1.2; // 較慢
      case 'MEDIUM':
        return baseTime;
      case 'HIGH':
        return baseTime * 0.8; // 較快
      default:
        return baseTime;
    }
  }

  /**
   * 執行球動畫
   */
  private async animateBall(path: BallPath[]): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let currentPathIndex = 0;

      const animate = () => {
        const currentTime = Date.now() - startTime;

        // 找到當前時間對應的路徑點
        while (currentPathIndex < path.length - 1 &&
               path[currentPathIndex + 1].timestamp <= currentTime) {
          currentPathIndex++;
        }

        // 清除畫布並繪製球
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGame();

        if (currentPathIndex < path.length) {
          const currentPoint = path[currentPathIndex];
          this.drawBall(currentPoint.x, currentPoint.y);

          this.animationId = requestAnimationFrame(animate);
        } else {
          // 動畫完成
          this.animationId = null;
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * 繪製球
   */
  private drawBall(x: number, y: number): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, 8, 0, 2 * Math.PI);
    this.ctx.fillStyle = '#FFD700';
    this.ctx.fill();
    this.ctx.strokeStyle = '#FFA500';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  /**
   * 取得格子中心 X 座標
   */
  private getBinCenterX(binIndex: number): number {
    const binWidth = this.canvas.width / (this.config.rowCount + 1);
    return binWidth * (binIndex + 0.5);
  }

  /**
   * 停止動畫
   */
  stopAnimation(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.isAnimating = false;
  }
}
```

---

## 任務 5: 全流程整合測試

### 任務描述
建立完整的整合測試套件，涵蓋從前端 API 呼叫、後端處理、到前端動畫展示的完整流程，確保系統在各種情況下都能正確運作。

### 功能需求
1. 建立 Vitest 單元測試覆蓋所有核心功能
2. 建立 Playwright E2E 測試模擬真實使用情境
3. 實作長期 RTP 收斂性測試
4. 建立異常情況處理測試
5. 實作效能測試確保系統穩定性

### 驗收標準
- [ ] 單元測試覆蓋率達到 90% 以上
- [ ] E2E 測試涵蓋所有主要使用流程
- [ ] RTP 收斂性測試通過（1000+ 次測試）
- [ ] 異常處理測試涵蓋所有錯誤情況
- [ ] 效能測試確保動畫流暢度 60FPS
- [ ] 所有測試在 CI/CD 環境中穩定執行

### 測試方法

#### 測試 1: 正常通過測試
```javascript
// 完整流程測試 - 前端只傳送非關鍵參數
describe('Complete Game Flow', () => {
  it('should complete full game cycle successfully', async () => {
    const { page } = await setup();

    // 設定投注金額（前端只能控制這個）
    await page.fill('[data-testid="bet-amount"]', '10');

    // 投球
    await page.click('[data-testid="drop-ball"]');

    // 等待動畫完成
    await page.waitForSelector('[data-testid="ball-animation-complete"]', { timeout: 5000 });

    // 驗證結果顯示
    await expect(page.locator('[data-testid="game-result"]')).toBeVisible();
    await expect(page.locator('[data-testid="balance-updated"]')).toBeVisible();

    // 驗證遊戲配置由後端決定並正確顯示
    await expect(page.locator('[data-testid="game-config"]')).toBeVisible();
    await expect(page.locator('[data-testid="risk-level-display"]')).toBeVisible();
    await expect(page.locator('[data-testid="rtp-display"]')).toBeVisible();
  });
});
```

#### 測試 2: 失敗測試
```javascript
// 網路錯誤處理測試
describe('Error Handling', () => {
  it('should handle API failure gracefully', async () => {
    const { page } = await setup();

    // 模擬 API 錯誤
    await page.route('**/api/play', route => {
      route.fulfill({ status: 500, body: 'Server Error' });
    });

    await page.fill('[data-testid="bet-amount"]', '10');
    await page.click('[data-testid="drop-ball"]');

    // 應該顯示錯誤訊息
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('伺服器錯誤');

    // 球動畫不應該執行
    await expect(page.locator('[data-testid="ball-animation"]')).not.toBeVisible();
  });

  it('should prevent frontend from controlling critical parameters', async () => {
    const { page } = await setup();

    // 前端不應該有控制 riskLevel、targetRTP 等參數的介面
    await expect(page.locator('[data-testid="risk-level-selector"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="target-rtp-input"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="row-count-selector"]')).not.toBeVisible();
  });
});
```

#### 測試 3: Critical Test (關鍵測試)
```javascript
// RTP 收斂性測試 - 使用正確的 API 格式
describe('RTP Convergence Test', () => {
  it('should converge to backend-determined RTP over 1000 games', async () => {
    const results = [];
    const gameCount = 1000;

    for (let i = 0; i < gameCount; i++) {
      const response = await fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betAmount: 1,
          gameId: `test-game-${i}`
        })
      });

      const result = await response.json();
      results.push(result);
    }

    // 計算實際 RTP
    const totalBet = gameCount;
    const totalPayout = results.reduce((sum, r) => sum + r.payout, 0);
    const actualRTP = totalPayout / totalBet;

    // 取得後端決定的目標 RTP（從第一個結果）
    const backendTargetRTP = results[0].gameConfig.targetRTP;

    // 驗證 RTP 收斂到後端決定的目標值（允許 ±2% 誤差）
    expect(actualRTP).toBeCloseTo(backendTargetRTP, 1);

    // 驗證沒有異常的極端值
    const profits = results.map(r => r.profit);
    const maxProfit = Math.max(...profits);
    const minProfit = Math.min(...profits);

    expect(maxProfit).toBeLessThan(1000); // 合理的最大獲利
    expect(minProfit).toBeGreaterThan(-10); // 合理的最大虧損

    // 驗證所有遊戲都使用了後端決定的配置
    const firstConfig = results[0].gameConfig;
    results.forEach(result => {
      expect(result.gameConfig.riskLevel).toBe(firstConfig.riskLevel);
      expect(result.gameConfig.targetRTP).toBe(firstConfig.targetRTP);
      expect(result.gameConfig.rowCount).toBe(firstConfig.rowCount);
    });
  });

  it('should apply different configs for different bet amounts', async () => {
    // 測試小額投注
    const smallBetResponse = await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betAmount: 10 })
    });
    const smallBetResult = await smallBetResponse.json();

    // 測試大額投注
    const largeBetResponse = await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betAmount: 1000 })
    });
    const largeBetResult = await largeBetResponse.json();

    // 驗證後端對不同投注金額使用不同配置
    expect(smallBetResult.gameConfig).toBeDefined();
    expect(largeBetResult.gameConfig).toBeDefined();

    // 大額投注通常使用更保守的設定
    expect(largeBetResult.gameConfig.targetRTP).toBeLessThanOrEqual(smallBetResult.gameConfig.targetRTP);
  });
});
```

### 範例程式碼

```typescript
// tests/integration/game-flow.spec.ts
import { test, expect } from '@playwright/test';
import { setupTestData, cleanupTestData } from '../utils/test-helpers';

test.describe('Complete Game Integration', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestData();
    await page.goto('/');
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('backend determines all game configurations', async ({ page }) => {
    // 設定不同的投注金額來測試後端不同配置
    const betAmounts = [10, 100, 500];

    for (const betAmount of betAmounts) {
      await page.fill('[data-testid="bet-amount"]', betAmount.toString());

      // 模擬後端回應（後端決定所有遊戲配置）
      await page.route('**/api/play', async (route) => {
        const request = route.request();
        const body = JSON.parse(request.postData() || '{}');

        // 驗證前端只傳送投注金額
        expect(body.betAmount).toBe(betAmount);
        expect(body.riskLevel).toBeUndefined(); // 前端不應該傳送
        expect(body.targetRTP).toBeUndefined(); // 前端不應該傳送
        expect(body.rowCount).toBeUndefined();  // 前端不應該傳送

        // 後端根據投注金額決定配置
        const gameConfig = betAmount > 100 ? {
          riskLevel: 'LOW',
          targetRTP: 0.95,
          rowCount: 14,
          maxBetAmount: 1000
        } : {
          riskLevel: 'MEDIUM',
          targetRTP: 0.97,
          rowCount: 16,
          maxBetAmount: 500
        };

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            binIndex: 8,
            multiplier: 1.5,
            payout: betAmount * 1.5,
            profit: betAmount * 0.5,
            signature: 'test-signature',
            gameConfig,
            gameId: null,
            timestamp: Date.now()
          })
        });
      });

      // 投球
      await page.click('[data-testid="drop-ball"]');

      // 等待動畫完成
      await page.waitForSelector('[data-testid="ball-landed"]', { timeout: 5000 });

      // 驗證結果顯示包含後端決定的配置
      await expect(page.locator('[data-testid="game-config-display"]')).toBeVisible();
      await expect(page.locator('[data-testid="multiplier"]')).toContainText('1.5');
    }
  });

  test('handles concurrent ball drops', async ({ page }) => {
    // 快速連續點擊投球按鈕
    const dropButton = page.locator('[data-testid="drop-ball"]');

    await dropButton.click();
    await dropButton.click(); // 第二次點擊應該被忽略
    await dropButton.click(); // 第三次點擊應該被忽略

    // 應該只有一個球動畫
    const ballAnimations = page.locator('[data-testid="ball-animation"]');
    await expect(ballAnimations).toHaveCount(1);

    // 等待動畫完成
    await page.waitForSelector('[data-testid="ball-landed"]', { timeout: 5000 });

    // 現在應該可以投下一球
    await dropButton.click();
    await page.waitForSelector('[data-testid="ball-landed"]', { timeout: 5000 });
  });

  test('maintains accurate balance tracking', async ({ page }) => {
    const initialBalance = 1000;
    const betAmount = 50;

    // 設定初始餘額
    await page.evaluate((balance) => {
      localStorage.setItem('plinko_balance', balance.toString());
    }, initialBalance);

    await page.reload();

    // 驗證初始餘額顯示
    await expect(page.locator('[data-testid="balance"]')).toContainText(initialBalance.toString());

    // 設定投注金額
    await page.fill('[data-testid="bet-amount"]', betAmount.toString());

    // 模擬後端回應
    await page.route('**/api/play', async (route) => {
      const request = route.request();
      const body = JSON.parse(request.postData() || '{}');

      // 驗證前端只傳送投注金額
      expect(body.betAmount).toBe(betAmount);
      expect(body.riskLevel).toBeUndefined();
      expect(body.targetRTP).toBeUndefined();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          binIndex: 0,
          multiplier: 2.0,
          payout: betAmount * 2,
          profit: betAmount,
          signature: 'test-signature',
          gameConfig: {
            riskLevel: 'MEDIUM',
            targetRTP: 0.97,
            rowCount: 16,
            maxBetAmount: 1000
          },
          gameId: null,
          timestamp: Date.now()
        })
      });
    });

    await page.click('[data-testid="drop-ball"]');
    await page.waitForSelector('[data-testid="ball-landed"]', { timeout: 5000 });

    // 驗證餘額更新
    const expectedBalance = initialBalance + betAmount; // 獲利 50
    await expect(page.locator('[data-testid="balance"]')).toContainText(expectedBalance.toString());
  });
});

// src/lib/utils/__tests__/rtp-controller.test.ts
import { describe, it, expect } from 'vitest';
import { RTPController } from '../rtp-controller';

describe('RTPController', () => {
  let controller: RTPController;

  beforeEach(() => {
    controller = new RTPController();
  });

  it('should calculate bin index within valid range', () => {
    const binIndex = controller.calculateOptimalBinIndex(16, 'MEDIUM', 0.97, 10);
    expect(binIndex).toBeGreaterThanOrEqual(0);
    expect(binIndex).toBeLessThanOrEqual(16);
  });

  it('should converge to target RTP over many iterations', () => {
    const iterations = 10000;
    const targetRTP = 0.97;
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const binIndex = controller.calculateOptimalBinIndex(16, 'MEDIUM', targetRTP, 1);
      results.push(binIndex);
    }

    // 計算實際 RTP
    const totalPayout = results.reduce((sum, binIndex) => {
      return sum + binPayouts[16]['MEDIUM'][binIndex];
    }, 0);

    const actualRTP = totalPayout / iterations;
    expect(actualRTP).toBeCloseTo(targetRTP, 1);
  });

  it('should apply risk control for large bets', () => {
    const smallBetResults = [];
    const largeBetResults = [];

    // 收集小額投注結果
    for (let i = 0; i < 1000; i++) {
      const binIndex = controller.calculateOptimalBinIndex(16, 'HIGH', 0.97, 10);
      smallBetResults.push(binIndex);
    }

    // 收集大額投注結果
    for (let i = 0; i < 1000; i++) {
      const binIndex = controller.calculateOptimalBinIndex(16, 'HIGH', 0.97, 1000);
      largeBetResults.push(binIndex);
    }

    // 計算極高倍數格子的出現頻率
    const smallBetHighPayouts = smallBetResults.filter(idx => binPayouts[16]['HIGH'][idx] > 100).length;
    const largeBetHighPayouts = largeBetResults.filter(idx => binPayouts[16]['HIGH'][idx] > 100).length;

    // 大額投注時，極高倍數格子的頻率應該降低
    expect(largeBetHighPayouts).toBeLessThan(smallBetHighPayouts);
  });
});
```

---

## 安全性改進總結

### 🔒 關鍵安全措施

本次開發任務的核心目標是確保**前端無法控制任何影響遊戲機率或落點的關鍵參數**，以防止作弊和操控。

#### 前端限制
- ✅ **只能傳送非關鍵參數**：`betAmount`（投注金額）、`gameId`（可選的遊戲會話ID）
- ❌ **禁止傳送關鍵參數**：`riskLevel`、`targetRTP`、`rowCount` 等
- ✅ **參數過濾機制**：前端服務自動過濾並清理請求參數
- ✅ **輸入驗證**：基本的投注金額範圍檢查

#### 後端安全控制
- ✅ **完全控制遊戲邏輯**：所有關鍵參數由後端根據商業規則決定
- ✅ **動態配置**：根據投注金額、玩家等級等因素調整遊戲配置
- ✅ **風控機制**：大額投注自動應用更保守的設定
- ✅ **簽章驗證**：使用 HMAC 確保回傳資料完整性
- ✅ **詳細日誌**：記錄所有請求和配置決策

#### 測試保障
- ✅ **安全性測試**：驗證前端無法控制關鍵參數
- ✅ **RTP 收斂測試**：確保後端決定的 RTP 正確實施
- ✅ **配置驗證測試**：確認不同情況下使用正確的遊戲配置
- ✅ **錯誤處理測試**：驗證各種異常情況的安全處理

### 🎯 實作優先順序

建議按照以下順序逐步實作：

1. **任務 1**：建立 RTP 控制系統（核心邏輯）
2. **任務 2**：實作安全的後端 API（關鍵安全措施）
3. **任務 3**：更新前端 API 整合（移除危險參數）
4. **任務 4**：最佳化動畫系統（使用者體驗）
5. **任務 5**：全面測試驗證（確保安全性）

每完成一個任務都要通過所有測試，特別是 **Critical Test**，確保安全性措施有效運作。

### 🛡️ 最終目標

完成這些任務後，系統將達成：
- **絕對安全**：前端無法影響任何遊戲結果
- **精確控制**：後端可精確控制 RTP 和遊戲配置
- **優質體驗**：流暢自然的動畫效果
- **完整測試**：全面的安全性和功能測試覆蓋

這樣的架構確保了「**透過後端控制精確 RTP，前端僅負責表演結果**」的核心目標。

## 總結

以上五個主要開發任務涵蓋了完整的 RTP 控制系統實作，每個任務都包含：

1. **詳細的功能需求與驗收標準**
2. **三種類型的測試方法**：
   - 正常通過測試（驗證基本功能）
   - 失敗測試（驗證錯誤處理）
   - Critical Test（驗證關鍵邏輯與安全性）
3. **完整的範例程式碼**

建議按照任務順序逐步實作，每完成一個任務都要通過所有測試後再進行下一個任務。這樣可以確保系統的穩定性與正確性，最終達成「透過後端控制精確 RTP，前端僅負責表演結果」的目標。
