"use strict";

(() => {
  const ICONS = {
    radio:
      '<path d="M4.9 19.1a10 10 0 0 1 0-14.2"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/>',
    refresh:
      '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    grid: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    layers:
      '<path d="m12 2 10 5-10 5L2 7l10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    wallet:
      '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    server:
      '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    route:
      '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash:
      '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
  };

  const I18N = {
    ko: {
      skip: "본문으로 건너뛰기",
      checking: "확인 중",
      online: "온라인",
      offline: "오프라인",
      live: "실시간",
      paused: "일시정지",
      refresh: "잔액 새로고침",
      refreshShort: "새로고침",
      language: "언어",
      toggleTheme: "테마 전환",
      sections: "섹션",
      tabOverview: "개요",
      tabCredentials: "자격증명",
      tabModels: "모델",
      tabSettings: "설정",
      tabInfo: "정보",
      save: "저장",
      restart: "Bridge 재시작",
      unsaved: "저장되지 않은 변경이 있습니다",
      restartPending: "저장됨 · 재시작 후 적용",
      demoBanner: "데모 데이터를 표시하고 있습니다. 실제 설정을 보려면 ?demo 없이 여세요.",
      connectionLost: "Bridge에 연결할 수 없습니다. 다시 시도하는 중입니다.",
      retry: "다시 시도",
      kpiBalance: "총 잔액",
      kpiBalanceHint: "{n}개 key 합산",
      kpiRoutable: "라우팅 가능",
      kpiRoutableHint: "사용 가능 / 전체 key",
      kpiInFlight: "처리 중 요청",
      kpiInFlightHint: "key당 최대 {n}",
      kpiModels: "활성 모델",
      kpiModelsHint: "카탈로그 {n}개 중",
      kpiUpstream: "업스트림",
      upstreamProvider: "Provider API",
      upstreamAlpha: "Alpha 터널",
      loadTitle: "실시간 부하",
      loadDesc:
        "모든 key의 처리 중 요청 합계를 {s}초마다 샘플링합니다. 이 페이지를 연 뒤부터 쌓인 기록이며 서버에 저장되지 않습니다.",
      loadEmpty: "샘플이 쌓이면 여기에 표시됩니다.",
      figNow: "현재",
      figPeak: "최고",
      figAvg: "평균",
      figSamples: "샘플",
      balanceTitle: "key별 잔액 비중",
      balanceDesc: "각 key의 현재 잔액이 전체에서 차지하는 비율입니다.",
      balanceEmpty: "아직 잔액 정보가 없습니다. 잔액 새로고침을 눌러 보세요.",
      totalBalance: "총 잔액",
      credsTitle: "자격증명 상태",
      credsDesc: "라우터가 보는 key별 상태, 잔액, 소진 속도, 사용량 한도입니다.",
      colKey: "Key",
      colStatus: "상태",
      colBalance: "잔액",
      colDays: "남은 기간",
      colBurn: "일일 소진",
      colQuota: "5시간 / 주간 한도",
      colInFlight: "처리 중",
      colSessions: "대화",
      colLast: "마지막 선택",
      stReady: "사용 가능",
      stOff: "수동 꺼짐",
      stCooling: "쿨다운",
      stExpired: "만료",
      stQuota: "한도 초과",
      stBilling: "잔액 조회 실패",
      viaProvider: "Provider API",
      viaAlpha: "API 프록시",
      noCreds: "등록된 key가 없습니다",
      noCredsHint: "자격증명 탭에서 CommandCode API key를 추가하세요.",
      never: "없음",
      dayUnit: "일",
      editTitle: "자격증명 편집",
      editDesc:
        "이름, API key, 사용 여부를 바꿀 수 있습니다. API key를 비워 두면 기존 값을 유지합니다. 변경은 저장 후 재시작해야 적용됩니다.",
      addCred: "Key 추가",
      name: "이름",
      apiKey: "API key",
      apiKeyKeep: "비워 두면 기존 key 유지",
      enabled: "사용",
      remove: "삭제",
      modelsTitle: "모델 카탈로그",
      modelsDesc:
        "브리지가 /v1/models에 공개하고 요청을 허용할 모델입니다. 기본값 외 모델은 켜야 사용할 수 있습니다.",
      searchModels: "모델 검색",
      enableAll: "모두 켜기",
      disableAll: "모두 끄기",
      noModels: "검색 결과가 없습니다",
      context: "컨텍스트",
      bindTitle: "서버 바인드",
      bindDesc:
        "재시작 후 적용됩니다. 0.0.0.0은 클라이언트 API key를 설정한 신뢰 네트워크에서만 쓰세요.",
      host: "호스트",
      port: "포트",
      localOnly: "로컬 전용",
      clientKey: "클라이언트 API key",
      clientKeyHelp: "/v1 호출과 관리자 쓰기에 쓰는 key입니다. 이 브라우저에만 저장됩니다.",
      generate: "생성",
      copy: "복사",
      useKey: "이 key 사용",
      routingTitle: "라우팅 정책",
      routingDesc: "여러 key가 있을 때 다음 요청을 받을 key를 고르는 방법입니다.",
      maxPer: "key당 최대 동시 요청",
      serviceTitle: "서비스",
      serviceDesc: "지금 이 브리지 프로세스의 상태입니다.",
      version: "버전",
      upstreamMode: "업스트림 모드",
      endpoint: "엔드포인트",
      defaultModel: "기본 모델",
      bridgeKeySet: "클라이언트 key",
      configured: "설정됨",
      notConfigured: "미설정",
      lastUpdate: "마지막 갱신",
      routingInfoTitle: "라우팅 조정값",
      routingInfoDesc: "라우터가 key를 고르고 쉬게 하는 기준입니다.",
      policy: "정책",
      fallback: "대체 정책",
      billingRefresh: "잔액 조회 주기",
      cooldown: "실패 후 쿨다운",
      maxTotal: "전체 최대 동시 요청",
      unlimited: "자동",
      saved: "저장했습니다. 재시작해야 적용됩니다.",
      saveFailed: "저장하지 못했습니다: ",
      duplicateKey: "같은 CommandCode API key가 여러 번 입력되었습니다.",
      restarting: "재시작을 요청했습니다. 다시 연결되기를 기다리는 중입니다.",
      restarted: "재시작이 끝났습니다.",
      restartTimeout: "30초 안에 다시 연결되지 않았습니다. 서비스 상태를 확인하세요.",
      restartUnsupported:
        "이 프로세스는 스스로 재시작할 수 없습니다. 컨테이너나 서비스를 직접 재시작하세요.",
      restartFailed: "재시작 요청에 실패했습니다: ",
      refreshed: "잔액을 새로 불러왔습니다.",
      refreshFailed: "잔액을 불러오지 못했습니다.",
      keyGenerated: "새 key를 만들었습니다. 저장하고 재시작하면 적용됩니다.",
      keyCopied: "key를 복사했습니다.",
      keyEmpty: "복사할 key가 없습니다.",
      keyStored: "이 브라우저가 관리자 호출에 이 key를 씁니다.",
      copyFailed: "클립보드에 복사하지 못했습니다.",
      demoReadOnly: "데모 모드에서는 저장하거나 재시작하지 않습니다.",
      minutes: "분",
      seconds: "초",
      policies: {
        daily_burn_priority: ["잔액/남은 일수 우선", "만료 전에 써야 할 크레딧을 먼저 씁니다."],
        balance_priority: ["잔액 많은 순", "현재 잔액이 큰 key를 먼저 씁니다."],
        round_robin: ["순환 분산", "요청마다 key를 차례대로 고릅니다."],
        drain_first: [
          "기한 짧은 key부터 소진",
          "남은 기한이 가장 짧은 key를 다 쓴 뒤 다음 key로 넘어갑니다.",
        ],
      },
    },
    en: {
      skip: "Skip to content",
      checking: "Checking",
      online: "Online",
      offline: "Offline",
      live: "Live",
      paused: "Paused",
      refresh: "Refresh balances",
      refreshShort: "Refresh",
      language: "Language",
      toggleTheme: "Toggle theme",
      sections: "Sections",
      tabOverview: "Overview",
      tabCredentials: "Credentials",
      tabModels: "Models",
      tabSettings: "Settings",
      tabInfo: "Info",
      save: "Save",
      restart: "Restart bridge",
      unsaved: "You have unsaved changes",
      restartPending: "Saved · applies after restart",
      demoBanner: "Showing demo data. Open without ?demo to see the live configuration.",
      connectionLost: "Cannot reach the bridge. Retrying.",
      retry: "Retry",
      kpiBalance: "Total balance",
      kpiBalanceHint: "across {n} keys",
      kpiRoutable: "Routable keys",
      kpiRoutableHint: "ready / total",
      kpiInFlight: "In-flight requests",
      kpiInFlightHint: "up to {n} per key",
      kpiModels: "Enabled models",
      kpiModelsHint: "of {n} in the catalog",
      kpiUpstream: "Upstream",
      upstreamProvider: "Provider API",
      upstreamAlpha: "Alpha tunnel",
      loadTitle: "Live load",
      loadDesc:
        "In-flight requests across every key, sampled every {s}s. The history starts when this page opens and is not stored on the server.",
      loadEmpty: "Samples appear here as they arrive.",
      figNow: "Now",
      figPeak: "Peak",
      figAvg: "Average",
      figSamples: "Samples",
      balanceTitle: "Balance by key",
      balanceDesc: "Each key's share of the combined current balance.",
      balanceEmpty: "No balance data yet. Try Refresh balances.",
      totalBalance: "total balance",
      credsTitle: "Credential health",
      credsDesc: "What the router sees for each key: state, balance, burn rate, and usage limits.",
      colKey: "Key",
      colStatus: "Status",
      colBalance: "Balance",
      colDays: "Days left",
      colBurn: "Daily burn",
      colQuota: "5h / weekly limit",
      colInFlight: "In flight",
      colSessions: "Sessions",
      colLast: "Last selected",
      stReady: "ready",
      stOff: "turned off",
      stCooling: "cooling down",
      stExpired: "expired",
      stQuota: "limit reached",
      stBilling: "balance lookup failed",
      viaProvider: "Provider API",
      viaAlpha: "API proxy",
      noCreds: "No keys configured",
      noCredsHint: "Add a CommandCode API key on the Credentials tab.",
      never: "never",
      dayUnit: "d",
      editTitle: "Edit credentials",
      editDesc:
        "Rename keys, replace API keys, or turn them off. Leave the API key empty to keep the stored one. Changes apply after save and restart.",
      addCred: "Add key",
      name: "Name",
      apiKey: "API key",
      apiKeyKeep: "Leave empty to keep the stored key",
      enabled: "On",
      remove: "Remove",
      modelsTitle: "Model catalog",
      modelsDesc:
        "Models the bridge lists on /v1/models and accepts requests for. Non-default models must be turned on first.",
      searchModels: "Search models",
      enableAll: "Enable all",
      disableAll: "Disable all",
      noModels: "No models match",
      context: "context",
      bindTitle: "Server bind",
      bindDesc:
        "Applies after restart. Use 0.0.0.0 only on a trusted network with a client API key set.",
      host: "Host",
      port: "Port",
      localOnly: "local only",
      clientKey: "Client API key",
      clientKeyHelp: "Used for /v1 calls and admin writes. Stored only in this browser.",
      generate: "Generate",
      copy: "Copy",
      useKey: "Use this key",
      routingTitle: "Routing policy",
      routingDesc: "How the bridge picks the key for the next request when several are configured.",
      maxPer: "Max concurrent requests per key",
      serviceTitle: "Service",
      serviceDesc: "How this bridge process is doing right now.",
      version: "Version",
      upstreamMode: "Upstream mode",
      endpoint: "Endpoint",
      defaultModel: "Default model",
      bridgeKeySet: "Client key",
      configured: "configured",
      notConfigured: "not configured",
      lastUpdate: "Last update",
      routingInfoTitle: "Routing tunables",
      routingInfoDesc: "The limits the router uses to pick and rest keys.",
      policy: "Policy",
      fallback: "Fallback policy",
      billingRefresh: "Balance refresh",
      cooldown: "Cooldown after failure",
      maxTotal: "Max total concurrent",
      unlimited: "auto",
      saved: "Saved. Restart to apply.",
      saveFailed: "Could not save: ",
      duplicateKey: "The same CommandCode API key is entered more than once.",
      restarting: "Restart requested. Waiting for the bridge to come back.",
      restarted: "Restart finished.",
      restartTimeout: "The bridge did not come back within 30s. Check the service.",
      restartUnsupported:
        "This process cannot restart itself. Restart the container or service manually.",
      restartFailed: "Restart request failed: ",
      refreshed: "Balances refreshed.",
      refreshFailed: "Could not refresh balances.",
      keyGenerated: "New key generated. Save and restart to apply it.",
      keyCopied: "Key copied.",
      keyEmpty: "No key to copy.",
      keyStored: "This browser now uses this key for admin calls.",
      copyFailed: "Could not copy to the clipboard.",
      demoReadOnly: "Demo mode does not save or restart.",
      minutes: "min",
      seconds: "s",
      policies: {
        daily_burn_priority: [
          "Balance / days left first",
          "Spends credits that must be used before expiry first.",
        ],
        balance_priority: ["Highest balance first", "Prefers the key with the largest balance."],
        round_robin: ["Round robin", "Picks keys in turn on each request."],
        drain_first: [
          "Drain soonest-expiring first",
          "Uses up the key with the least time left, then moves on.",
        ],
      },
    },
    zh: {
      skip: "跳到正文",
      checking: "检查中",
      online: "在线",
      offline: "离线",
      live: "实时",
      paused: "已暂停",
      refresh: "刷新余额",
      refreshShort: "刷新",
      language: "语言",
      toggleTheme: "切换主题",
      sections: "分区",
      tabOverview: "概览",
      tabCredentials: "凭据",
      tabModels: "模型",
      tabSettings: "设置",
      tabInfo: "信息",
      save: "保存",
      restart: "重启 Bridge",
      unsaved: "有未保存的更改",
      restartPending: "已保存 · 重启后生效",
      demoBanner: "正在显示演示数据。去掉 ?demo 即可查看实际配置。",
      connectionLost: "无法连接 Bridge，正在重试。",
      retry: "重试",
      kpiBalance: "总余额",
      kpiBalanceHint: "{n} 个 key 合计",
      kpiRoutable: "可路由 key",
      kpiRoutableHint: "可用 / 全部",
      kpiInFlight: "处理中请求",
      kpiInFlightHint: "每个 key 最多 {n}",
      kpiModels: "已启用模型",
      kpiModelsHint: "目录共 {n} 个",
      kpiUpstream: "上游",
      upstreamProvider: "Provider API",
      upstreamAlpha: "Alpha 通道",
      loadTitle: "实时负载",
      loadDesc:
        "每 {s} 秒采样一次所有 key 的处理中请求总数。记录从打开此页面开始，不保存在服务器上。",
      loadEmpty: "采样后会显示在这里。",
      figNow: "当前",
      figPeak: "峰值",
      figAvg: "平均",
      figSamples: "样本",
      balanceTitle: "各 key 余额占比",
      balanceDesc: "每个 key 当前余额占总余额的比例。",
      balanceEmpty: "暂无余额数据，请点击刷新余额。",
      totalBalance: "总余额",
      credsTitle: "凭据状态",
      credsDesc: "路由器看到的每个 key 的状态、余额、消耗速度和用量限制。",
      colKey: "Key",
      colStatus: "状态",
      colBalance: "余额",
      colDays: "剩余天数",
      colBurn: "每日消耗",
      colQuota: "5 小时 / 每周限额",
      colInFlight: "处理中",
      colSessions: "会话",
      colLast: "最近选择",
      stReady: "可用",
      stOff: "已手动关闭",
      stCooling: "冷却中",
      stExpired: "已过期",
      stQuota: "已达限额",
      stBilling: "余额查询失败",
      viaProvider: "Provider API",
      viaAlpha: "API 代理",
      noCreds: "尚未配置 key",
      noCredsHint: "请在凭据页添加 CommandCode API key。",
      never: "无",
      dayUnit: "天",
      editTitle: "编辑凭据",
      editDesc: "可以重命名、替换 API key 或关闭 key。API key 留空则保留原值。保存并重启后生效。",
      addCred: "添加 key",
      name: "名称",
      apiKey: "API key",
      apiKeyKeep: "留空则保留原 key",
      enabled: "启用",
      remove: "删除",
      modelsTitle: "模型目录",
      modelsDesc: "Bridge 在 /v1/models 中公开并接受请求的模型。非默认模型需要先启用。",
      searchModels: "搜索模型",
      enableAll: "全部启用",
      disableAll: "全部停用",
      noModels: "没有匹配的模型",
      context: "上下文",
      bindTitle: "服务绑定",
      bindDesc: "重启后生效。仅在设置了客户端 API key 的可信网络中使用 0.0.0.0。",
      host: "主机",
      port: "端口",
      localOnly: "仅本机",
      clientKey: "客户端 API key",
      clientKeyHelp: "用于 /v1 调用和管理写入，只保存在此浏览器中。",
      generate: "生成",
      copy: "复制",
      useKey: "使用此 key",
      routingTitle: "路由策略",
      routingDesc: "配置多个 key 时，Bridge 选择下一个请求所用 key 的方式。",
      maxPer: "每个 key 最大并发请求",
      serviceTitle: "服务",
      serviceDesc: "当前 Bridge 进程的状态。",
      version: "版本",
      upstreamMode: "上游模式",
      endpoint: "端点",
      defaultModel: "默认模型",
      bridgeKeySet: "客户端 key",
      configured: "已配置",
      notConfigured: "未配置",
      lastUpdate: "最近更新",
      routingInfoTitle: "路由参数",
      routingInfoDesc: "路由器选择和暂停 key 所用的阈值。",
      policy: "策略",
      fallback: "备用策略",
      billingRefresh: "余额刷新周期",
      cooldown: "失败后冷却",
      maxTotal: "总最大并发",
      unlimited: "自动",
      saved: "已保存，重启后生效。",
      saveFailed: "保存失败：",
      duplicateKey: "同一个 CommandCode API key 被输入了多次。",
      restarting: "已请求重启，正在等待 Bridge 恢复。",
      restarted: "重启完成。",
      restartTimeout: "30 秒内未恢复连接，请检查服务。",
      restartUnsupported: "此进程无法自行重启，请手动重启容器或服务。",
      restartFailed: "重启请求失败：",
      refreshed: "余额已刷新。",
      refreshFailed: "无法刷新余额。",
      keyGenerated: "已生成新 key，保存并重启后生效。",
      keyCopied: "已复制 key。",
      keyEmpty: "没有可复制的 key。",
      keyStored: "此浏览器将使用该 key 进行管理调用。",
      copyFailed: "无法复制到剪贴板。",
      demoReadOnly: "演示模式不会保存或重启。",
      minutes: "分钟",
      seconds: "秒",
      policies: {
        daily_burn_priority: ["优先余额/剩余天数", "优先消耗到期前必须使用的额度。"],
        balance_priority: ["余额高优先", "优先使用当前余额最高的 key。"],
        round_robin: ["轮询", "每次请求按顺序选择 key。"],
        drain_first: ["优先耗尽期限最短的 key", "先用完剩余期限最短的 key，再使用下一个。"],
      },
    },
  };

  const POLICY_IDS = ["daily_burn_priority", "balance_priority", "round_robin", "drain_first"];
  const TABS = ["overview", "credentials", "models", "settings", "info"];
  const SAMPLE_MS = 5000;
  const SAMPLE_LIMIT = 72;
  const DEMO = new URLSearchParams(location.search).has("demo");

  const state = {
    lang: detectLang(),
    theme: localStorage.getItem("dashboardTheme") === "light" ? "light" : "dark",
    tab: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview",
    health: null,
    config: null,
    online: null,
    live: true,
    dirty: false,
    savedPendingRestart: false,
    pendingKey: authKey(localStorage.getItem("pendingBridgeApiKey")),
    samples: [],
    lastUpdatedAt: null,
    modelFilter: "",
    busy: false,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );

  function detectLang() {
    const raw = String(localStorage.getItem("dashboardLang") || navigator.language || "ko");
    const lower = raw.toLowerCase();
    if (lower.startsWith("en")) return "en";
    if (lower.startsWith("zh")) return "zh";
    return "ko";
  }

  function t(key, vars) {
    const table = I18N[state.lang] || I18N.ko;
    let text = table[key] ?? I18N.en[key] ?? key;
    if (vars && typeof text === "string") {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replace(`{${name}}`, value);
      }
    }
    return text;
  }

  function icon(name) {
    return `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${
      ICONS[name] || ""
    }</svg></span>`;
  }

  function hydrateIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${
        ICONS[el.dataset.icon] || ""
      }</svg>`;
    });
  }

  function isRedacted(value) {
    const v = String(value || "").trim();
    return (
      !v || v === "[REDACTED]" || v === "sk-[REDACTED]" || v.includes("…") || v.includes("...")
    );
  }

  function authKey(value) {
    return isRedacted(value) ? "" : String(value || "").trim();
  }

  function storedKey() {
    return authKey(localStorage.getItem("bridgeApiKey"));
  }

  function authHeaders() {
    const key = storedKey() || state.pendingKey;
    return key
      ? {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        }
      : { "content-type": "application/json" };
  }

  async function api(path, init = {}) {
    const request = {
      ...init,
      cache: "no-store",
      headers: { ...authHeaders(), ...(init.headers || {}) },
    };
    let response;
    try {
      response = await fetch(path, request);
    } catch (error) {
      if (!location.hostname || location.port) throw error;
      response = await fetch(`http://${location.hostname}:9992${path}`, request);
    }
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function errorText(error) {
    const text = String(error?.message || error || "");
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.code === "duplicate_commandcode_api_key") {
        return t("duplicateKey");
      }
      if (typeof parsed?.error?.message === "string") {
        return parsed.error.message;
      }
    } catch {
      return text;
    }
    return text;
  }

  const money = (value) =>
    Number.isFinite(value)
      ? `$${value.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "—";

  function relativeTime(ms) {
    if (!Number.isFinite(ms)) return t("never");
    const diff = Math.max(0, Date.now() - ms);
    const locale = state.lang === "zh" ? "zh-CN" : state.lang;
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (diff < 60_000) {
      return rtf.format(-Math.round(diff / 1000), "second");
    }
    if (diff < 3_600_000) {
      return rtf.format(-Math.round(diff / 60_000), "minute");
    }
    if (diff < 86_400_000) {
      return rtf.format(-Math.round(diff / 3_600_000), "hour");
    }
    return rtf.format(-Math.round(diff / 86_400_000), "day");
  }

  function duration(ms) {
    if (!Number.isFinite(ms)) return "—";
    if (ms >= 60_000) return `${Math.round(ms / 60_000)} ${t("minutes")}`;
    return `${Math.round(ms / 1000)} ${t("seconds")}`;
  }

  function credentialView(credential) {
    const metrics = credential.metrics || {};
    const billing = metrics.billing || {};
    const bm = billing.metrics || {};
    const balance = Number(bm.currentBalance ?? billing.monthlyCredits);
    const days = Number(bm.daysRemaining);
    const burn = Number(bm.requiredDailyBurn);
    const windows = billing.windowLimits || {};
    const quotaExceeded = Boolean(
      windows.limited &&
      (windows.fiveHour?.exceeded || windows.weekly?.exceeded) &&
      Number(billing.purchasedCredits ?? 0) <= 0,
    );
    const expired = Number.isFinite(days) && days <= 0;
    let status = "ready";
    if (expired) status = "expired";
    else if (credential.enabled === false) status = "off";
    else if (metrics.disabledUntil && metrics.disabledUntil > Date.now()) {
      status = "cooling";
    } else if (quotaExceeded) status = "quota";
    else if (metrics.billingError && !Number.isFinite(balance)) {
      status = "billing";
    }
    return {
      credential,
      metrics,
      balance: Number.isFinite(balance) ? balance : NaN,
      days,
      burn,
      windows,
      status,
      expired,
      inFlight: Number(metrics.inFlight) || 0,
      sessions: Number(metrics.activeSessions) || 0,
      lastSelectedAt: Number(metrics.lastSelectedAt),
    };
  }

  const STATUS_TONE = {
    ready: "good",
    off: "muted",
    cooling: "warn",
    expired: "bad",
    quota: "bad",
    billing: "warn",
  };
  const STATUS_LABEL = {
    ready: "stReady",
    off: "stOff",
    cooling: "stCooling",
    expired: "stExpired",
    quota: "stQuota",
    billing: "stBilling",
  };

  function badge(tone, label) {
    return `<span class="badge" data-tone="${tone}">${esc(label)}</span>`;
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function seriesColors() {
    return cssVar("--series")
      .split(",")
      .map((hex) => hex.trim())
      .filter(Boolean)
      .map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  }

  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ].map((row) => row.map((v) => (v + 0.5) / 16));
  const CELL = 2;

  function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const cols = Math.max(8, Math.round(rect.width / CELL));
    const rows = Math.max(8, Math.round(rect.height / CELL));
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, cols, rows);
    return { ctx, cols, rows };
  }

  function paintArea(canvas, values, rgb) {
    const { ctx, cols, rows } = prepareCanvas(canvas);
    const max = Math.max(1, ...values);
    const floor = rows - 1;
    const top = 3;
    for (let y = top; y < floor; y += 8) {
      for (let x = 0; x < cols; x += 3) {
        ctx.fillStyle = `rgba(${rgb.join(",")},0.12)`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const last = Math.max(values.length - 1, 1);
    for (let x = 0; x < cols; x += 1) {
      const pos = (x / Math.max(cols - 1, 1)) * last;
      const i = Math.floor(pos);
      const f = pos - i;
      const a = values[i] ?? 0;
      const b = values[Math.min(i + 1, values.length - 1)] ?? a;
      const value = a + (b - a) * f;
      const peak = Math.round(floor - (value / max) * (floor - top));
      const depth = floor - peak;
      for (let y = peak; y < floor; y += 1) {
        const density = depth > 0 ? (y - peak) / depth : 1;
        const lit = density > BAYER[y & 3][x & 3] - 0.1;
        const alpha = (0.28 + density * 0.62) * (lit ? 1 : 0.35);
        ctx.fillStyle = `rgba(${rgb.join(",")},${alpha.toFixed(3)})`;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.fillStyle = `rgba(${rgb.join(",")},0.9)`;
      ctx.fillRect(x, peak, 1, 1);
    }
  }

  function paintDonut(canvas, shares, colors) {
    const { ctx, cols, rows } = prepareCanvas(canvas);
    const cx = cols / 2;
    const cy = rows / 2;
    const outer = Math.min(cols, rows) / 2 - 1;
    const inner = outer * 0.62;
    const bounds = [];
    let acc = 0;
    for (const share of shares) {
      bounds.push([acc, acc + share]);
      acc += share;
    }
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const r = Math.hypot(dx, dy);
        if (r > outer || r < inner) continue;
        let angle = Math.atan2(dx, -dy) / (Math.PI * 2);
        if (angle < 0) angle += 1;
        const slice = bounds.findIndex(([start, end]) => angle >= start && angle < end);
        if (slice < 0) continue;
        const rgb = colors[slice % colors.length];
        const density = (r - inner) / (outer - inner);
        const lit = 1 - density * 0.5 > BAYER[y & 3][x & 3];
        const alpha = lit ? 0.92 : 0.38;
        ctx.fillStyle = `rgba(${rgb.join(",")},${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function views() {
    return (state.config?.credentials || []).map(credentialView);
  }

  function renderOverview() {
    const panel = $("panel-overview");
    if (!state.config) {
      panel.innerHTML = `<div class="kpis">${Array.from({ length: 5 })
        .map(
          () =>
            '<article class="card kpi"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:40%;height:28px;margin-top:14px"></div></article>',
        )
        .join("")}</div>`;
      return;
    }
    const all = views();
    const known = all.filter((v) => Number.isFinite(v.balance));
    const total = known.reduce((sum, v) => sum + v.balance, 0);
    const active = all.filter((v) => !v.expired && v.credential.enabled !== false);
    const ready = all.filter((v) => v.status === "ready");
    const inFlight = all.reduce((sum, v) => sum + v.inFlight, 0);
    const maxPer = state.config.routing?.maxInFlightPerCredential ?? 4;
    const models = state.config.models || [];
    const enabledModels = models.filter((m) => m.enabled).length;
    const providerApi = state.health?.upstream === "commandcode-provider-api";
    const routableBad = active.length > 0 && ready.length === 0;

    const kpi = (label, iconName, value, hint, tone) => `
      <article class="card kpi">
        <p class="kpi-label">${icon(iconName)}${esc(label)}</p>
        <p class="kpi-value${tone ? ` tone-${tone}` : ""}">${value}</p>
        <p class="kpi-hint">${esc(hint)}</p>
      </article>`;

    const samples = state.samples.map((s) => s.value);
    const peak = samples.length ? Math.max(...samples) : 0;
    const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;

    const shareRows = known
      .filter((v) => v.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .map((v) => ({
        name: v.credential.id,
        value: v.balance,
        share: v.balance / (total || 1),
      }));
    const colors = seriesColors();

    panel.innerHTML = `
      <section class="kpis" aria-label="${esc(t("tabOverview"))}">
        ${kpi(
          t("kpiBalance"),
          "wallet",
          esc(known.length ? money(total) : "—"),
          t("kpiBalanceHint", { n: String(known.length) }),
        )}
        ${kpi(
          t("kpiRoutable"),
          "route",
          `${ready.length}<span class="muted">/${all.length}</span>`,
          t("kpiRoutableHint"),
          routableBad ? "bad" : "",
        )}
        ${kpi(
          t("kpiInFlight"),
          "gauge",
          String(inFlight),
          t("kpiInFlightHint", { n: String(maxPer) }),
        )}
        ${kpi(
          t("kpiModels"),
          "layers",
          `${enabledModels}<span class="muted">/${models.length}</span>`,
          t("kpiModelsHint", { n: String(models.length) }),
        )}
        ${kpi(
          t("kpiUpstream"),
          "server",
          esc(providerApi ? t("upstreamProvider") : t("upstreamAlpha")),
          state.health?.auth?.upstream_mode || state.config.bridge?.upstream_mode || "auto",
        )}
      </section>

      <section class="pair">
        <article class="card">
          <div class="card-head"><div>
            <h2 class="card-title">${esc(t("loadTitle"))}</h2>
            <p class="card-desc">${esc(t("loadDesc", { s: String(SAMPLE_MS / 1000) }))}</p>
          </div></div>
          <div class="chart-box" role="img" aria-label="${esc(
            `${t("loadTitle")}: ${t("figPeak")} ${peak}, ${t("figAvg")} ${avg.toFixed(1)}`,
          )}">
            ${
              samples.length > 1
                ? '<canvas id="loadCanvas"></canvas>'
                : `<div class="chart-empty">${esc(t("loadEmpty"))}</div>`
            }
          </div>
          <dl class="figures">
            <div><dt>${esc(t("figNow"))}</dt><dd>${inFlight}</dd></div>
            <div><dt>${esc(t("figPeak"))}</dt><dd>${peak}</dd></div>
            <div><dt>${esc(t("figAvg"))}</dt><dd>${avg.toFixed(1)}</dd></div>
            <div><dt>${esc(t("figSamples"))}</dt><dd>${samples.length}</dd></div>
          </dl>
        </article>

        <article class="card">
          <div class="card-head"><div>
            <h2 class="card-title">${esc(t("balanceTitle"))}</h2>
            <p class="card-desc">${esc(t("balanceDesc"))}</p>
          </div></div>
          ${
            shareRows.length
              ? `<div class="donut-wrap">
                  <div class="donut" role="img" aria-label="${esc(
                    shareRows.map((r) => `${r.name} ${(r.share * 100).toFixed(1)}%`).join(", "),
                  )}">
                    <canvas id="donutCanvas"></canvas>
                    <div class="donut-center"><b>${esc(
                      money(total),
                    )}</b><span>${esc(t("totalBalance"))}</span></div>
                  </div>
                  <ul class="legend">
                    ${shareRows
                      .map(
                        (r, i) =>
                          `<li>
                          <span class="swatch" style="background:rgb(${(
                            colors[i % colors.length] || [0, 0, 0]
                          ).join(",")})"></span>
                          <span class="name" title="${esc(r.name)}">${esc(r.name)}</span>
                          <span class="num">${esc(money(r.value))}</span>
                          <span class="pct num">${(r.share * 100).toFixed(0)}%</span>
                        </li>`,
                      )
                      .join("")}
                  </ul>
                </div>`
              : `<div class="empty">${icon("wallet")}<b>${esc(t("balanceEmpty"))}</b></div>`
          }
        </article>
      </section>

      <article class="card">
        <div class="card-head"><div>
          <h2 class="card-title">${esc(t("credsTitle"))}</h2>
          <p class="card-desc">${esc(t("credsDesc"))}</p>
        </div></div>
        ${
          all.length
            ? credentialTable(all)
            : `<div class="empty">${icon("key")}<b>${esc(
                t("noCreds"),
              )}</b><span>${esc(t("noCredsHint"))}</span></div>`
        }
      </article>`;

    if (samples.length > 1) {
      paintArea($("loadCanvas"), samples, cssVar("--chart-rgb").split(",").map(Number));
    }
    if (shareRows.length) {
      paintDonut(
        $("donutCanvas"),
        shareRows.map((r) => r.share),
        colors,
      );
    }
  }

  function quotaMeter(windows) {
    const parts = [windows.fiveHour, windows.weekly].filter(Boolean);
    if (!parts.length) return '<span class="muted">—</span>';
    const worst = Math.max(...parts.map((w) => (w.cap > 0 ? w.used / w.cap : 0)));
    const tone = parts.some((w) => w.exceeded) ? "bad" : worst >= 0.8 ? "warn" : "";
    const text = parts.map((w) => `${Number(w.used).toFixed(2)}/${w.cap}`).join(" · ");
    return `<div class="meter">
      <div class="meter-track"><div class="meter-fill"${
        tone ? ` data-tone="${tone}"` : ""
      } style="width:${Math.min(100, worst * 100).toFixed(1)}%"></div></div>
      <span class="meter-text">${esc(text)}</span>
    </div>`;
  }

  function credentialTable(all) {
    const rows = all
      .map((v) => {
        const c = v.credential;
        const via = c.providerApiAccess === true ? t("viaProvider") : t("viaAlpha");
        const statusCell = `${badge(STATUS_TONE[v.status], t(STATUS_LABEL[v.status]))}${
          v.status === "ready"
            ? `<div class="muted" style="font-size:12px;margin-top:4px">${esc(via)}</div>`
            : ""
        }${
          v.status === "billing"
            ? `<div class="tone-warn" style="font-size:12px;margin-top:4px;max-width:14rem" title="${esc(
                v.metrics.billingError,
              )}">${esc(String(v.metrics.billingError).slice(0, 60))}</div>`
            : ""
        }`;
        return `<tr>
          <td><div class="cred-id"><b>${esc(c.id)}</b><span>${esc(
            c.apiKeyPreview || "—",
          )}</span></div></td>
          <td>${statusCell}</td>
          <td class="right num">${esc(money(v.balance))}</td>
          <td class="right num">${
            Number.isFinite(v.days) ? `${Math.max(0, v.days).toFixed(1)} ${esc(t("dayUnit"))}` : "—"
          }</td>
          <td class="right num">${
            Number.isFinite(v.burn) ? `${esc(money(v.burn))}/${esc(t("dayUnit"))}` : "—"
          }</td>
          <td>${quotaMeter(v.windows)}</td>
          <td class="right num">${v.inFlight}</td>
          <td class="right num">${v.sessions}</td>
          <td class="muted">${esc(relativeTime(v.lastSelectedAt))}</td>
        </tr>`;
      })
      .join("");
    return `<div class="table-scroll"><table>
      <thead><tr>
        <th scope="col">${esc(t("colKey"))}</th><th scope="col">${esc(t("colStatus"))}</th>
        <th scope="col" class="right">${esc(
          t("colBalance"),
        )}</th><th scope="col" class="right">${esc(t("colDays"))}</th>
        <th scope="col" class="right">${esc(
          t("colBurn"),
        )}</th><th scope="col">${esc(t("colQuota"))}</th>
        <th scope="col" class="right">${esc(t("colInFlight"))}</th>
        <th scope="col" class="right">${esc(t("colSessions"))}</th><th scope="col">${esc(t("colLast"))}</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderCredentials() {
    const panel = $("panel-credentials");
    if (!state.config) {
      panel.innerHTML = "";
      return;
    }
    const creds = state.config.credentials;
    panel.innerHTML = `
      <article class="card">
        <div class="card-head">
          <div><h2 class="card-title">${esc(
            t("editTitle"),
          )}</h2><p class="card-desc">${esc(t("editDesc"))}</p></div>
          <div class="card-actions">
            <button class="btn btn-outline btn-sm" type="button" id="addCred">${icon(
              "plus",
            )}${esc(t("addCred"))}</button>
          </div>
        </div>
        ${
          creds.length
            ? creds
                .map((c, i) => {
                  const expired = credentialView(c).expired;
                  return `<div class="cred-edit">
                    <div class="field"><label for="cid-${i}">${esc(t("name"))}</label>
                      <input class="input" id="cid-${i}" data-cid="${i}" value="${esc(
                        c.id,
                      )}" autocomplete="off" /></div>
                    <div class="field field-key"><label for="ckey-${i}">${esc(t("apiKey"))}${
                      c.apiKeyPreview ? ` · ${esc(c.apiKeyPreview)}` : ""
                    }</label>
                      <input class="input" id="ckey-${i}" data-ckey="${i}" type="password" autocomplete="new-password" placeholder="${esc(
                        t("apiKeyKeep"),
                      )}" value="${esc(c.apiKey || "")}" /></div>
                    <div class="field"><span class="label" id="cen-label-${i}">${esc(
                      t("enabled"),
                    )}</span>
                      <label class="switch"><input type="checkbox" data-cenabled="${i}" aria-labelledby="cen-label-${i} cid-${i}" ${
                        c.enabled !== false && !expired ? "checked" : ""
                      } ${expired ? "disabled" : ""} /><span></span></label></div>
                    <button class="btn btn-ghost btn-icon btn-danger" type="button" data-del="${i}" aria-label="${esc(
                      `${t("remove")} ${c.id}`,
                    )}">${icon("trash")}</button>
                  </div>`;
                })
                .join("")
            : `<div class="empty">${icon("key")}<b>${esc(t("noCreds"))}</b></div>`
        }
      </article>`;

    $("addCred").onclick = () => {
      creds.push({
        id: `key${creds.length + 1}`,
        weight: 1,
        enabled: true,
      });
      markDirty();
      renderCredentials();
    };
    panel.querySelectorAll("[data-cid]").forEach((el) => {
      el.oninput = () => {
        creds[Number(el.dataset.cid)].id = el.value;
        markDirty();
      };
    });
    panel.querySelectorAll("[data-ckey]").forEach((el) => {
      el.oninput = () => {
        creds[Number(el.dataset.ckey)].apiKey = el.value.trim();
        markDirty();
      };
    });
    panel.querySelectorAll("[data-cenabled]").forEach((el) => {
      el.onchange = () => {
        creds[Number(el.dataset.cenabled)].enabled = el.checked;
        markDirty();
      };
    });
    panel.querySelectorAll("[data-del]").forEach((el) => {
      el.onclick = () => {
        creds.splice(Number(el.dataset.del), 1);
        markDirty();
        renderCredentials();
      };
    });
  }

  function renderModels() {
    const panel = $("panel-models");
    if (!state.config) {
      panel.innerHTML = "";
      return;
    }
    const models = state.config.models;
    const query = state.modelFilter.trim().toLowerCase();
    const groups = new Map();
    models.forEach((m, index) => {
      const hay = `${m.id} ${m.label || ""} ${m.provider || ""}`.toLowerCase();
      if (query && !hay.includes(query)) return;
      const provider = String(m.provider || m.id.split("/")[0] || "custom");
      if (!groups.has(provider)) groups.set(provider, []);
      groups.get(provider).push({ m, index });
    });
    const sorted = [...groups].sort(([a], [b]) =>
      a.localeCompare(b, "en", { sensitivity: "base" }),
    );
    const enabled = models.filter((m) => m.enabled).length;

    panel.innerHTML = `
      <article class="card">
        <div class="card-head">
          <div><h2 class="card-title">${esc(
            t("modelsTitle"),
          )} <span class="muted num" style="font-size:14px">${enabled}/${models.length}</span></h2>
          <p class="card-desc">${esc(t("modelsDesc"))}</p></div>
          <div class="model-toolbar">
            <label class="sr-only" for="modelSearch">${esc(t("searchModels"))}</label>
            <input class="input" id="modelSearch" type="search" placeholder="${esc(
              t("searchModels"),
            )}" value="${esc(state.modelFilter)}" />
            <button class="btn btn-outline btn-sm" type="button" id="enableAll">${esc(
              t("enableAll"),
            )}</button>
            <button class="btn btn-outline btn-sm" type="button" id="disableAll">${esc(
              t("disableAll"),
            )}</button>
          </div>
        </div>
        ${
          sorted.length
            ? `<div class="provider-grid">${sorted
                .map(([provider, items]) => {
                  const on = items.filter((x) => x.m.enabled).length;
                  return `<section class="provider" aria-label="${esc(provider)}">
                    <div class="provider-head"><h3>${esc(
                      provider,
                    )}</h3><span class="provider-count" data-count="${esc(
                      provider,
                    )}">${on}/${items.length}</span></div>
                    ${items
                      .map(
                        ({ m, index }) =>
                          `<div class="model-row">
                          <div style="min-width:0"><div class="label">${esc(
                            m.label || m.id,
                          )}</div><div class="id" title="${esc(m.id)}">${esc(m.id)}</div></div>
                          <label class="switch"><input type="checkbox" data-mid="${index}" aria-label="${esc(
                            m.label || m.id,
                          )}" ${m.enabled ? "checked" : ""} /><span></span></label>
                          <div class="meta">${esc(
                            [
                              m.contextWindow
                                ? `${m.contextWindow.toLocaleString("en-US")} ${t("context")}`
                                : "",
                              m.notes || "",
                            ]
                              .filter(Boolean)
                              .join(" · "),
                          )}</div>
                        </div>`,
                      )
                      .join("")}
                  </section>`;
                })
                .join("")}</div>`
            : `<div class="empty">${icon("layers")}<b>${esc(t("noModels"))}</b></div>`
        }
      </article>`;

    const search = $("modelSearch");
    search.oninput = () => {
      state.modelFilter = search.value;
      renderModels();
      const next = $("modelSearch");
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    };
    const setAll = (value) => {
      models.forEach((m) => {
        m.enabled = value;
      });
      markDirty();
      renderModels();
    };
    $("enableAll").onclick = () => setAll(true);
    $("disableAll").onclick = () => setAll(false);
    panel.querySelectorAll("[data-mid]").forEach((el) => {
      el.onchange = () => {
        models[Number(el.dataset.mid)].enabled = el.checked;
        const section = el.closest(".provider");
        const count = section?.querySelector(".provider-count");
        if (count) {
          const boxes = section.querySelectorAll("[data-mid]");
          const on = [...boxes].filter((box) => box.checked).length;
          count.textContent = `${on}/${boxes.length}`;
        }
        markDirty();
      };
    });
  }

  function randomKey() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return `sk-cmdbr-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  function renderSettings() {
    const panel = $("panel-settings");
    if (!state.config) {
      panel.innerHTML = "";
      return;
    }
    const { server, routing } = state.config;
    const shownKey = state.pendingKey || storedKey();
    panel.innerHTML = `
      <div class="settings-grid">
        <article class="card">
          <div class="card-head"><div><h2 class="card-title">${esc(
            t("bindTitle"),
          )}</h2><p class="card-desc">${esc(t("bindDesc"))}</p></div></div>
          <div class="form-grid">
            <div class="field"><label for="bindHost">${esc(t("host"))}</label>
              <select class="select" id="bindHost">
                <option value="127.0.0.1" ${
                  server.host === "127.0.0.1" ? "selected" : ""
                }>127.0.0.1 · ${esc(t("localOnly"))}</option>
                <option value="0.0.0.0" ${
                  server.host === "0.0.0.0" ? "selected" : ""
                }>0.0.0.0 · LAN / Tailscale</option>
              </select></div>
            <div class="field"><label for="bindPort">${esc(t("port"))}</label>
              <input class="input" id="bindPort" type="number" min="1" max="65535" value="${esc(
                server.port,
              )}" /></div>
          </div>
          <div class="field" style="margin-top:20px"><label for="bridgeKey">${esc(
            t("clientKey"),
          )}</label>
            <div class="key-row">
              <input class="input" id="bridgeKey" type="password" autocomplete="off" value="${esc(
                shownKey,
              )}" placeholder="sk-…" />
              <button class="btn btn-outline btn-sm" type="button" id="useKey">${esc(
                t("useKey"),
              )}</button>
            </div>
            <div class="key-row" style="justify-content:space-between;align-items:center">
              <span class="help">${esc(t("clientKeyHelp"))}</span>
              <span style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" type="button" id="genKey">${esc(
                  t("generate"),
                )}</button>
                <button class="btn btn-ghost btn-sm" type="button" id="copyKey">${icon(
                  "copy",
                )}${esc(t("copy"))}</button>
              </span>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="card-head"><div><h2 class="card-title">${esc(
            t("routingTitle"),
          )}</h2><p class="card-desc">${esc(t("routingDesc"))}</p></div></div>
          <fieldset class="policy-list" style="border:0;margin:0;padding:0">
            <legend class="sr-only">${esc(t("routingTitle"))}</legend>
            ${POLICY_IDS.map((id) => {
              const [label, desc] = t("policies")[id];
              return `<label class="policy"><input type="radio" name="policy" value="${id}" ${
                routing.policy === id ? "checked" : ""
              } />
                <b>${esc(label)} <code>${id}</code></b><span>${esc(desc)}</span></label>`;
            }).join("")}
          </fieldset>
          <div class="field" style="margin-top:20px;max-width:240px"><label for="maxPer">${esc(
            t("maxPer"),
          )}</label>
            <input class="input" id="maxPer" type="number" min="1" value="${esc(
              routing.maxInFlightPerCredential ?? 4,
            )}" /></div>
        </article>
      </div>`;

    $("bindHost").onchange = (e) => {
      server.host = e.target.value;
      markDirty();
    };
    $("bindPort").oninput = (e) => {
      server.port = Number(e.target.value) || 9992;
      markDirty();
    };
    $("maxPer").oninput = (e) => {
      routing.maxInFlightPerCredential = Number(e.target.value) || 4;
      markDirty();
    };
    panel.querySelectorAll('input[name="policy"]').forEach((el) => {
      el.onchange = () => {
        routing.policy = el.value;
        markDirty();
      };
    });
    $("genKey").onclick = () => {
      state.pendingKey = randomKey();
      localStorage.setItem("pendingBridgeApiKey", state.pendingKey);
      $("bridgeKey").value = state.pendingKey;
      markDirty();
      toast(t("keyGenerated"));
    };
    $("useKey").onclick = () => {
      const key = authKey($("bridgeKey").value);
      if (key) localStorage.setItem("bridgeApiKey", key);
      else localStorage.removeItem("bridgeApiKey");
      toast(t("keyStored"));
    };
    $("copyKey").onclick = async () => {
      const key = authKey($("bridgeKey").value);
      if (!key) return toast(t("keyEmpty"));
      try {
        await navigator.clipboard.writeText(key);
        toast(t("keyCopied"));
      } catch {
        toast(t("copyFailed"));
      }
    };
  }

  function renderInfo() {
    const panel = $("panel-info");
    if (!state.config) {
      panel.innerHTML = "";
      return;
    }
    const h = state.health || {};
    const r = state.config.routing || {};
    const row = (label, value) => `<tr><td>${esc(label)}</td><td>${value}</td></tr>`;
    const policyLabel = (id) => (t("policies")[id] ? t("policies")[id][0] : id || "—");
    panel.innerHTML = `
      <div class="settings-grid">
        <article class="card">
          <div class="card-head"><div><h2 class="card-title">${esc(
            t("serviceTitle"),
          )}</h2><p class="card-desc">${esc(t("serviceDesc"))}</p></div></div>
          <table class="kv-table"><tbody>
            ${row(
              t("colStatus"),
              state.online ? badge("good", t("online")) : badge("bad", t("offline")),
            )}
            ${row(
              t("version"),
              `<span class="mono">v${esc(h.version || state.config.bridge?.version || "—")}</span>`,
            )}
            ${row(
              t("upstreamMode"),
              esc(h.auth?.upstream_mode || state.config.bridge?.upstream_mode || "—"),
            )}
            ${row(
              t("endpoint"),
              `<span class="mono">${esc(
                h.endpoint || state.config.bridge?.endpoint || "—",
              )}</span>`,
            )}
            ${row(t("defaultModel"), `<span class="mono">${esc(h.default_model || "—")}</span>`)}
            ${row(
              t("bridgeKeySet"),
              esc(h.auth?.bridge_api_key_configured ? t("configured") : t("notConfigured")),
            )}
            ${row(t("lastUpdate"), esc(relativeTime(state.lastUpdatedAt)))}
          </tbody></table>
        </article>
        <article class="card">
          <div class="card-head"><div><h2 class="card-title">${esc(
            t("routingInfoTitle"),
          )}</h2><p class="card-desc">${esc(t("routingInfoDesc"))}</p></div></div>
          <table class="kv-table"><tbody>
            ${row(t("policy"), esc(policyLabel(r.policy)))}
            ${row(t("fallback"), esc(policyLabel(r.fallbackPolicy)))}
            ${row(t("maxPer"), esc(r.maxInFlightPerCredential ?? "—"))}
            ${row(t("maxTotal"), esc(r.maxTotalInFlight ?? t("unlimited")))}
            ${row(t("billingRefresh"), esc(duration(r.billingRefreshMs)))}
            ${row(t("cooldown"), esc(duration(r.credentialCooldownMs)))}
          </tbody></table>
        </article>
      </div>`;
  }

  function renderHeader() {
    const chip = $("statusChip");
    const stateName = state.online === null ? "checking" : state.online ? "online" : "offline";
    chip.dataset.state = stateName;
    $("statusText").textContent = t(stateName);
    const version = state.health?.version || state.config?.bridge?.version;
    $("versionText").textContent = version ? `v${version}` : "";
    $("liveToggle").setAttribute("aria-pressed", String(state.live));
    $("liveLabel").textContent = state.live ? t("live") : t("paused");
    const themeBtn = $("themeToggle");
    themeBtn.querySelector(".icon").dataset.icon = state.theme === "dark" ? "sun" : "moon";
    hydrateIcons(themeBtn);
  }

  function renderBanners() {
    const parts = [];
    if (DEMO) {
      parts.push(
        `<div class="banner" data-tone="warn"><div class="wrap">${esc(
          t("demoBanner"),
        )}</div></div>`,
      );
    }
    if (state.online === false && !DEMO) {
      parts.push(
        `<div class="banner" data-tone="bad" role="status"><div class="wrap"><span>${esc(
          t("connectionLost"),
        )}</span><button class="btn btn-outline btn-sm" type="button" id="retryBtn">${esc(
          t("retry"),
        )}</button></div></div>`,
      );
    }
    $("banners").innerHTML = parts.join("");
    const retry = $("retryBtn");
    if (retry) retry.onclick = () => void load();
  }

  function renderActionBar() {
    const bar = $("actionBar");
    const show = state.dirty || state.savedPendingRestart || state.config?.dirty;
    bar.hidden = !show;
    $("actionText").textContent = state.dirty ? t("unsaved") : t("restartPending");
    $("saveButton").disabled = !state.dirty || state.busy;
    $("restartButton").disabled = state.dirty || state.busy;
  }

  function renderTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      const selected = tab.dataset.tab === state.tab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    TABS.forEach((name) => {
      $(`panel-${name}`).hidden = name !== state.tab;
    });
  }

  const PANEL_RENDER = {
    overview: renderOverview,
    credentials: renderCredentials,
    models: renderModels,
    settings: renderSettings,
    info: renderInfo,
  };

  function applyStatic() {
    document.documentElement.lang = state.lang === "zh" ? "zh-CN" : state.lang;
    document.documentElement.dataset.theme = state.theme;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nAria));
    });
    $("langSelect").value = state.lang;
    document.title = "CommandCode Bridge";
  }

  function renderAll() {
    applyStatic();
    renderHeader();
    renderBanners();
    renderTabs();
    PANEL_RENDER[state.tab]();
    renderActionBar();
  }

  function renderLiveRegions() {
    renderHeader();
    renderBanners();
    if (state.tab === "overview" || state.tab === "info") {
      PANEL_RENDER[state.tab]();
    }
    renderActionBar();
  }

  function markDirty() {
    state.dirty = true;
    renderActionBar();
  }

  function recordSample() {
    const value = views().reduce((sum, v) => sum + v.inFlight, 0);
    state.samples.push({ at: Date.now(), value });
    if (state.samples.length > SAMPLE_LIMIT) state.samples.shift();
  }

  async function load() {
    if (DEMO) {
      state.health = demoHealth();
      if (!state.config) state.config = demoConfig();
      state.online = true;
      state.lastUpdatedAt = Date.now();
      demoTick();
      recordSample();
      return;
    }
    try {
      state.health = await api("/health");
      state.online = true;
    } catch {
      state.online = false;
    }
    if (!state.dirty) {
      try {
        state.config = await api("/admin/config");
        state.lastUpdatedAt = Date.now();
      } catch {
        state.online = state.health ? state.online : false;
      }
    }
    if (state.config) recordSample();
  }

  async function poll() {
    if (state.live && !state.busy) {
      await load();
      renderLiveRegions();
    }
    setTimeout(() => void poll(), SAMPLE_MS);
  }

  function credentialPayloads() {
    return state.config.credentials.map((c) => {
      const expired = credentialView(c).expired;
      return {
        id: String(c.id || "").trim() || "key",
        originalId: c.originalId || c.id,
        apiKey: c.apiKey || undefined,
        weight: c.weight || 1,
        enabled: expired ? undefined : c.enabled !== false,
        maxInFlight: c.maxInFlight,
        allowedModels: c.allowedModels,
      };
    });
  }

  async function save() {
    if (DEMO) return toast(t("demoReadOnly"));
    state.busy = true;
    renderActionBar();
    try {
      const payload = {
        ...(state.pendingKey ? { bridgeApiKey: state.pendingKey } : {}),
        server: state.config.server,
        routing: state.config.routing,
        models: state.config.models,
        credentials: credentialPayloads(),
      };
      state.config = await api("/admin/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      state.config.credentials.forEach((c) => {
        c.originalId = c.id;
      });
      state.dirty = false;
      state.savedPendingRestart = true;
      toast(t("saved"));
    } catch (error) {
      toast(t("saveFailed") + errorText(error));
    } finally {
      state.busy = false;
      renderAll();
    }
  }

  async function waitForBridge() {
    for (let elapsed = 0; elapsed < 30_000; elapsed += 2_000) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      try {
        const cfg = await api("/admin/config");
        if (!cfg.dirty) {
          state.config = cfg;
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  async function restart() {
    if (DEMO) return toast(t("demoReadOnly"));
    state.busy = true;
    renderActionBar();
    try {
      const res = await api("/admin/restart", {
        method: "POST",
        body: "{}",
      });
      if (res?.restart_requested === false) {
        toast(t("restartUnsupported"));
        return;
      }
      if (state.pendingKey) {
        localStorage.setItem("bridgeApiKey", state.pendingKey);
        localStorage.removeItem("pendingBridgeApiKey");
        state.pendingKey = "";
      }
      toast(t("restarting"));
      const ok = await waitForBridge();
      state.savedPendingRestart = !ok;
      toast(ok ? t("restarted") : t("restartTimeout"));
    } catch (error) {
      toast(t("restartFailed") + errorText(error));
    } finally {
      state.busy = false;
      renderAll();
    }
  }

  async function refreshBalances() {
    const btn = $("refreshBalances");
    btn.disabled = true;
    try {
      if (DEMO) {
        demoTick();
      } else {
        const res = await api("/admin/commandcode/credentials?refresh=true");
        const byId = new Map((res.credentials || []).map((m) => [m.id, m]));
        state.config?.credentials.forEach((c) => {
          c.metrics = byId.get(c.id) || c.metrics;
        });
      }
      state.lastUpdatedAt = Date.now();
      toast(t("refreshed"));
    } catch {
      toast(t("refreshFailed"));
    } finally {
      btn.disabled = false;
      renderAll();
    }
  }

  function selectTab(name, focus) {
    state.tab = name;
    history.replaceState(null, "", `#${name}`);
    renderTabs();
    PANEL_RENDER[name]();
    if (focus) document.querySelector(`.tab[data-tab="${name}"]`)?.focus();
  }

  function bind() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.onclick = () => selectTab(tab.dataset.tab, false);
      tab.onkeydown = (event) => {
        const index = TABS.indexOf(state.tab);
        let next = null;
        if (event.key === "ArrowRight") {
          next = TABS[(index + 1) % TABS.length];
        }
        if (event.key === "ArrowLeft") {
          next = TABS[(index - 1 + TABS.length) % TABS.length];
        }
        if (event.key === "Home") next = TABS[0];
        if (event.key === "End") next = TABS[TABS.length - 1];
        if (next) {
          event.preventDefault();
          selectTab(next, true);
        }
      };
    });
    $("liveToggle").onclick = () => {
      state.live = !state.live;
      renderHeader();
    };
    $("refreshBalances").onclick = () => void refreshBalances();
    $("themeToggle").onclick = () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("dashboardTheme", state.theme);
      renderAll();
    };
    $("langSelect").onchange = (event) => {
      state.lang = event.target.value;
      localStorage.setItem("dashboardLang", state.lang);
      renderAll();
    };
    $("saveButton").onclick = () => void save();
    $("restartButton").onclick = () => void restart();
    window.addEventListener("hashchange", () => {
      const name = location.hash.slice(1);
      if (TABS.includes(name) && name !== state.tab) {
        selectTab(name, false);
      }
    });
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.tab === "overview") renderOverview();
      }, 150);
    });
  }

  function demoHealth() {
    return {
      status: "ok",
      version: "1.74.0.b",
      upstream: "commandcode-alpha-generate",
      endpoint: "127.0.0.1:9992",
      default_model: "deepseek/deepseek-v4-pro",
      auth: { bridge_api_key_configured: true, upstream_mode: "auto" },
    };
  }

  function demoCredential(id, balance, days, burn, preview, extra = {}) {
    const now = Date.now();
    return {
      id,
      apiKeyConfigured: true,
      apiKeyPreview: preview,
      weight: 1,
      enabled: true,
      providerApiAccess: false,
      metrics: {
        id,
        inFlight: 0,
        activeSessions: 0,
        lastSelectedAt: now - Math.round(Math.random() * 600_000),
        disabledUntil: null,
        billing: {
          monthlyCredits: balance,
          purchasedCredits: 0,
          windowLimits: {
            limited: true,
            exceeded: null,
            fiveHour: {
              used: balance / 40,
              cap: 10,
              exceeded: false,
              resetAt: now + 3_600_000,
            },
            weekly: {
              used: balance / 6,
              cap: 60,
              exceeded: false,
              resetAt: now + 86_400_000,
            },
          },
          metrics: {
            currentBalance: balance,
            daysRemaining: days,
            requiredDailyBurn: burn,
          },
        },
      },
      ...extra,
    };
  }

  function demoConfig() {
    const catalog = [
      [
        "deepseek/deepseek-v4-pro",
        "DeepSeek V4 Pro",
        "DeepSeek",
        1_000_000,
        true,
        "$0.66/M in · $1.98/M out",
      ],
      [
        "deepseek/deepseek-v4-flash",
        "DeepSeek V4 Flash",
        "DeepSeek",
        1_000_000,
        true,
        "$0.15/M in · $0.6/M out",
      ],
      [
        "deepseek/deepseek-v4.1-flash",
        "DeepSeek V4.1 Flash",
        "DeepSeek",
        1_000_000,
        false,
        "$0.15/M in · $0.6/M out",
      ],
      ["moonshotai/Kimi-K2.6", "Kimi K2.6", "Moonshot", 256_000, true, "$0.95/M in · $4/M out"],
      ["zai-org/GLM-5.1", "GLM-5.1", "Z.ai", 200_000, true, "$1.4/M in · $4.4/M out"],
      [
        "MiniMaxAI/MiniMax-M2.7",
        "MiniMax M2.7",
        "MiniMax",
        200_000,
        true,
        "$0.3/M in · $1.2/M out",
      ],
      ["Qwen/Qwen3.6-Plus", "Qwen 3.6 Plus", "Qwen", 200_000, true, "$0.5/M in · $3/M out"],
      ["claude-opus-5-5", "Claude Opus 5.5", "Anthropic", 1_000_000, false, "$4/M in · $20/M out"],
      ["gpt-6-sol", "GPT-6 Sol", "OpenAI", 1_050_000, false, "$2/M in · $10/M out"],
      ["xai/grok-4.7", "Grok 4.7", "xAI", 500_000, false, "$1.2/M in · $3.6/M out"],
    ].map(([id, label, provider, contextWindow, enabled, notes]) => ({
      id,
      label,
      provider,
      contextWindow,
      enabled,
      notes,
    }));
    return {
      dirty: false,
      server: { host: "127.0.0.1", port: 9992 },
      routing: {
        policy: "daily_burn_priority",
        fallbackPolicy: "round_robin",
        maxInFlightPerCredential: 4,
        maxTotalInFlight: null,
        billingRefreshMs: 300_000,
        credentialCooldownMs: 60_000,
      },
      models: catalog,
      credentials: [
        demoCredential("main", 184.25, 11.4, 16.16, "sk-1…9f2a"),
        demoCredential("team-pro", 96.4, 4.2, 22.95, "sk-7…c10e"),
        demoCredential("backup", 31.8, 21.0, 1.51, "sk-3…77b1"),
        demoCredential("trial", 0, 0, 0, "sk-a…0d4c"),
        demoCredential("paused", 12.0, 18.5, 0.65, "sk-e…42aa", {
          enabled: false,
        }),
      ],
      bridge: {
        version: "1.74.0.b",
        upstream_mode: "auto",
        endpoint: "127.0.0.1:9992",
      },
    };
  }

  function demoTick() {
    const creds = state.config?.credentials || [];
    const phase = Date.now() / 20_000;
    creds.forEach((c, i) => {
      if (!c.metrics) return;
      const active = c.enabled !== false && (c.metrics.billing?.metrics?.daysRemaining ?? 1) > 0;
      c.metrics.inFlight = active
        ? Math.max(0, Math.round(1.6 + 1.6 * Math.sin(phase + i * 1.7)))
        : 0;
      c.metrics.activeSessions = active ? 2 + ((i * 3) % 5) : 0;
      if (i === 1) {
        c.metrics.disabledUntil = Math.sin(phase) > 0.6 ? Date.now() + 30_000 : null;
      }
    });
  }

  function seedDemoSamples() {
    if (!DEMO) return;
    const start = Date.now() - SAMPLE_LIMIT * SAMPLE_MS;
    for (let i = 0; i < SAMPLE_LIMIT - 1; i += 1) {
      const value = Math.max(0, Math.round(5 + 3.5 * Math.sin(i / 7) + 2 * Math.sin(i / 2.3)));
      state.samples.push({ at: start + i * SAMPLE_MS, value });
    }
  }

  hydrateIcons();
  bind();
  seedDemoSamples();
  renderAll();
  void load().then(() => {
    renderAll();
    setTimeout(() => void poll(), SAMPLE_MS);
  });
})();
