# Detailed Log Structure Tree

## FPCB Manufacturing Machine Systems

> [!NOTE]
> This document describes the detailed directory structure and log types of two machine models: **Dawon HST** and **Woori-200G**.

---

# 🏭 DAWON HST (Hot Stamping Tool)

```
Dawon HST
│
├── 📁 ERROR GROUP ────────────────────────────────────────────────────────────
│   │
│   ├── 📂 ErrorLog/
│   │   ├── 📄 Format: ErrorLog 2023_08_10.csv
│   │   ├── 📊 Count: ~802 files (~4.7 MB)
│   │   ├── 📋 Structure: Time, Error Code
│   │   │   └── Example: "01시25분07초, Under Error"
│   │   └── 🔴 Error Types (11 types, ~98,583 times):
│   │       ├── Under Error                    ── Under sensor error (80,809 times) 🔴
│   │       ├── 2Plate Check Error             ── Plate 2 check error (4,105 times)
│   │       ├── 1Plate Check Error             ── Plate 1 check error (3,905 times)
│   │       ├── 1Plate Number Error            ── Plate 1 number error (2,951 times)
│   │       ├── 2Plate Number Error            ── Plate 2 number error (2,488 times)
│   │       ├── Safety Sensors Error           ── Safety sensor error (1,534 times) 🔴
│   │       ├── Subsidiary Material Detect Error ── Subsidiary material detection error (1,023 times)
│   │       ├── TableHeater Error              ── Table heater error (942 times)
│   │       ├── Main Air Error                 ── Main air error (368 times)
│   │       ├── Ringblow Inverter Error        ── Ringblow inverter error (290 times)
│   │       └── Door Error                     ── Door error (168 times)
│   │
│   └── 📂 MotionOnLog/
│       ├── 📄 Format: MotionOnLog [Date].csv
│       ├── 📊 Count: ~629 files (~2.5 MB)
│       ├── 📋 Structure: Time, Error Code
│       │   └── Example: "03시27분07초, AreaAlarm : 1, bIsMainAirAlam : 0, EStopStatus"
│       └── 🚨 Alarm Types (2 types, ~2,857 times):
│           ├── AreaAlarm : 1       ── Safety zone alarm ON (1,534 times)
│           ├── AreaAlarm : 0       ── Safety zone alarm OFF (1,323 times)
│           ├── bIsMainAirAlam      ── Main air alarm (0=OK, 1=Alarm)
│           └── EStopStatus         ── Emergency Stop status
│
├── 📁 PRODUCTION GROUP ───────────────────────────────────────────────────────
│   │
│   ├── 📂 ProductionLog/
│   │   ├── 📄 Format: ProductionLog [Date].csv
│   │   ├── 📊 Count: ~804 files (~13 MB, ~201,081 entries)
│   │   ├── 📋 Structure: Group, Model Name, Bonding Time, Production, Alarm
│   │   │   └── Example: "DAWON HST, B4 FPCB, 00시21분47초, 00:11:08:517, 206, 204"
│   │   └── 📈 Recorded Information:
│   │       ├── Group              ── Machine group name (DAWON HST)
│   │       ├── Model Name         ── Product model name (B4 FPCB)
│   │       ├── Bonding Time       ── Bonding timestamp
│   │       ├── Production Time    ── Production duration (HH:MM:SS:ms)
│   │       ├── Point Count        ── Points processed (108-216/cycle)
│   │       └── Alarm Count        ── Accumulated alarm count
│   │
│   └── 📂 OperationLog/
│       ├── 📄 Format: OperationLog [Date].csv
│       ├── 📊 Count: ~804 files (~13 MB)
│       ├── 📋 Structure: Time, Operation List
│       │   └── Example: "00시10분05초, OP_AUTO_START"
│       └── 🔄 Operation States:
│           ├── OP_AUTO_START      ── Start automatic cycle
│           ├── OP_AUTO_END        ── End automatic cycle
│           └── OP_PAUSE_STOP      ── Pause/interrupt
│
├── 📁 PARAMETER GROUP ────────────────────────────────────────────────────────
│   │
│   └── 📂 ParameterLog/
│       ├── 📄 Format: ParameterLog 2023_08_10.csv
│       ├── 📊 Count: ~799 files (~3.9 MB)
│       ├── 📋 Structure: Time, Parameter Type, Before Data, New Data
│       │   └── Example: "02:04:20, 0 Array Base Mark Target, 80, 75"
│       └── ⚙️ Common Parameters:
│           ├── Array Base Mark Target    ── Array base mark target (65-95)
│           ├── Plate Mark Target         ── Plate mark target (80-95)
│           ├── Plate1 옵셋 (Offset)      ── Plate 1 offset (-20 to 8)
│           └── Point X Offset            ── Point X offset (-14 to 0)
│
└── 📁 CONFIG GROUP ───────────────────────────────────────────────────────────
    │
    ├── 📄 .ini (Main Configuration File)
    │   └── Contains sections:
    │       ├── [Plate Info]       ── Plate information (Target, Angle, Delay)
    │       ├── [Supply Info]      ── Supply information (Heater, Speed)
    │       ├── [Align Info]       ── Alignment information (Step, Vacuum, Ionizer)
    │       ├── [Attach Info]      ── Attachment information (Time, Mark Acceptance)
    │       └── [Light Info]       ── Light information (Under/Upper Camera)
    │
    ├── 📄 Note.ini
    │   └── Operation notes
    │
    └── 📁 VISION FILES
        ├── 🖼️ BaseMark_0.bmp    ── Base Mark reference image (~10 KB)
        └── 📐 BaseMark_0.pat    ── Pattern file for recognition (~2.7 KB)
```

---

# 🏭 WOORI-200G (FSB - Flexible Substrate Bonding)

```
Woori-200G (FSB Ver.2.3.1_190517)
│
├── 📁 ERROR GROUP ────────────────────────────────────────────────────────────
│   │
│   └── 📂 Alarm/
│       ├── 📄 Format: log/Alarm/[YYYY]/[MM]/[MM-DD].txt
│       ├── 📊 Size: ~104 MB
│       ├── 📋 Structure: [Timestamp] Alarm Code:Sensor Description
│       │   ├── Occurrence: "[2026-01-05 02:36:53(100)] 034.알람 발생(39):039.에어리어 센서 감지(전면)"
│       │   └── Release: "[2026-01-05 02:35:57(450)] 035.알람 해제(39):039.에어리어 센서 감지(전면)"
│       ├── 🔢 Alarm Codes:
│       │   ├── 034 (알람 발생)    ── Alarm occurrence
│       │   └── 035 (알람 해제)    ── Alarm release
│       └── 📍 Sensor Types:
│           ├── Sensor 39 (에어리어 센서 감지 - 전면)   ── Front area sensor
│           └── Sensor 40 (에어리어 센서 감지 - 좌측)   ── Left area sensor
│
├── 📁 PRODUCTION GROUP ───────────────────────────────────────────────────────
│   │
│   ├── 📂 stauts/ (Status Log)
│   │   ├── 📄 Format: [MM-DD].txt
│   │   ├── 📊 Size: ~6.6 MB
│   │   ├── 📋 Structure: Model | Start Time | End Time | Plan | Bonding | Error | Cycle Time | Tact Time
│   │   │   └── Example: "TK M1 MFC EPX [06:24:57] [06:25:05] 1 1 0 [00:07:40] [00:02:89]"
│   │   └── 📈 Recorded Information:
│   │       ├── Model              ── Product model name
│   │       ├── Start Time         ── Batch start time
│   │       ├── End Time           ── Batch end time
│   │       ├── Plan               ── Planned point count
│   │       ├── Bonding            ── Actual bonding point count
│   │       ├── Error              ── Error count in batch
│   │       ├── Cycle Time         ── Total cycle duration
│   │       └── Tact Time          ── Average time per point (2-3s)
│   │
│   └── 📂 main/ (Main Log)
│       ├── 📄 Format: log/main/[YYYY]/[MM]/[MM-DD].txt
│       ├── 📊 Size: ~389 MB
│       ├── 📋 Structure: [Timestamp] Event Description
│       │   └── Example: "[2026-01-05 05:30:58(086)] Model Change : TK M1 MFC EPX"
│       └── 📝 Main Events:
│           ├── Program Started/Exited         ── Program start/exit
│           ├── Model Change                   ── Product model change
│           ├── Sheet Count                    ── Current sheet count
│           ├── Heater On/Off                  ── Heater toggle
│           ├── 원점복귀 시작/완료              ── Homing start/complete
│           ├── SetTorqueLimit                 ── Set torque limit
│           └── [DISK_FULL] Auto remove log    ── Auto-delete old logs (>80% disk)
│
├── 📁 PARAMETER GROUP ────────────────────────────────────────────────────────
│   │
│   └── 📂 parameter/
│       ├── 📄 Format: log/parameter/[YYYY]/[MM]/[MM-DD].txt
│       ├── 📊 Size: ~2.7 MB
│       ├── 📋 Structure: [Timestamp] Parameter Type Group[n] Axis [old -> new] delta
│       │   └── Example: "[2026-01-05 05:49:59(526)] 상부 부착 위치 오프셋 그룹[2] 우_X [0.000 -> 1.185] 1.185"
│       └── ⚙️ Parameter Types:
│           ├── 상부 부착 위치 오프셋 (Upper attachment position offset)
│           │   ├── 그룹[1], 그룹[2]    ── Group 1, Group 2
│           │   ├── 좌_X, 좌_Y, 좌_R    ── Left X, Y, R
│           │   └── 우_X, 우_Y, 우_R    ── Right X, Y, R
│           └── 측정 부착 위치 오프셋 (Measurement attachment offset)
│               └── X, Y axes
│
├── 📁 DEBUG GROUP ────────────────────────────────────────────────────────────
│   │
│   └── 📂 debug/
│       ├── 📄 Format: log/Debug/[YYYY]/[MM]/[MM-DD].txt
│       ├── 📊 Size: ~6.9 GB (LARGEST)
│       ├── 📋 Structure: [Timestamp] Message (SourceFile/Method/LineNumber)
│       │   └── Example: "[2026-01-05 00:25:07(600)] ●[SetSequenceClear] (Mcs.cs/SetSequenceClear/648)"
│       ├── 💻 Source Code References:
│       │   ├── Mcs.cs              ── Motion Control System
│       │   ├── MainFrm.cs          ── Main Form UI
│       │   └── [Other .cs files]   ── Other modules
│       └── 🗑️ Auto Cleanup:
│           └── Auto-delete when disk > 80%: "Removed => [file path]"
│
└── 📁 CALIBRATION GROUP ──────────────────────────────────────────────────────
    │
    └── 📂 Compensation/
        ├── 📊 Size: ~144 KB
        ├── 📅 Data from: 2018-02-13
        │
        ├── 📂 TableOffset/
        │   ├── 📂 HeadX/
        │   │   └── Compensation data for Head X axis
        │   │       ├── Position compensation by X coordinate
        │   │       └── Offset values for each point
        │   │
        │   └── 📂 Upper/
        │       └── Compensation data for Upper unit
        │           ├── Offset by axes
        │           └── Calibration values
        │
        ├── 📄 CompensationAll_[Date].txt
        │   └── Summary of all compensation values
        │
        └── 📄 CompensationError_[Date].txt
            └── Records calibration errors
```

---

# 📊 COMPARISON SUMMARY TABLE

| Log Group             | Dawon HST                               | Woori-200G               | Notes                        |
| --------------------- | --------------------------------------- | ------------------------ | ---------------------------- |
| **ERROR GROUP**       | 2 folders (ErrorLog, MotionOnLog)       | 1 folder (Alarm)         | Dawon separates Motion Alarm |
| **PRODUCTION GROUP**  | 2 folders (ProductionLog, OperationLog) | 2 folders (stauts, main) | Equivalent                   |
| **PARAMETER GROUP**   | 1 folder (ParameterLog)                 | 1 folder (parameter)     | Equivalent                   |
| **DEBUG GROUP**       | ❌ None                                 | 1 folder (debug) ~6.9GB  | Woori only                   |
| **CONFIG GROUP**      | 3 files (.ini, .bmp, .pat)              | ❌ None                  | Dawon only                   |
| **CALIBRATION GROUP** | ❌ None                                 | 1 folder (Compensation)  | Woori only                   |

---

# 🔧 TECHNICAL SPECIFICATIONS

| Criteria                | Dawon HST                             | Woori-200G                               |
| ----------------------- | ------------------------------------- | ---------------------------------------- |
| **Timestamp Format**    | `01시25분07초` (Korean)               | `[2026-01-05 05:30:58(086)]` (ISO)       |
| **File Encoding**       | UTF-8/Mixed                           | UTF-16LE                                 |
| **File Format**         | CSV                                   | Text structured                          |
| **File Naming**         | `[Type]_[Year]년[Month]월[Day]일.csv` | `log/[category]/[YYYY]/[MM]/[MM-DD].txt` |
| **Directory Structure** | Flat                                  | Hierarchical (Year/Month)                |
| **Language**            | Korean only                           | Korean + English                         |
| **Total Size**          | ~37 MB                                | ~7.3 GB                                  |
| **Total Files**         | ~3,841 files                          | ~1,578 files                             |
| **Disk Management**     | Manual                                | Auto (>80% cleanup)                      |

---

# 🔴 COMPLETE LIST OF ERROR/ALARM TYPES (From Actual Data)

## DAWON HST - ErrorLog (11 Error Types)

| #   | Error Code                           | Description                         | Count  | Severity         |
| --- | ------------------------------------ | ----------------------------------- | ------ | ---------------- |
| 1   | **Under Error**                      | Under sensor error                  | 80,809 | 🔴 Very Frequent |
| 2   | **2Plate Check Error**               | Plate 2 check error                 | 4,105  | 🟠 Frequent      |
| 3   | **1Plate Check Error**               | Plate 1 check error                 | 3,905  | 🟠 Frequent      |
| 4   | **1Plate Number Error**              | Plate 1 number error                | 2,951  | 🟠 Frequent      |
| 5   | **2Plate Number Error**              | Plate 2 number error                | 2,488  | 🟠 Frequent      |
| 6   | **Safety Sensors Error**             | Safety sensor error                 | 1,534  | 🔴 Critical      |
| 7   | **Subsidiary Material Detect Error** | Subsidiary material detection error | 1,023  | 🟡 Medium        |
| 8   | **TableHeater Error**                | Table heater error                  | 942    | 🟡 Medium        |
| 9   | **Main Air Error**                   | Main air error                      | 368    | 🟡 Medium        |
| 10  | **Ringblow Inverter Error**          | Ringblow inverter error             | 290    | 🟡 Medium        |
| 11  | **Door Error**                       | Door error                          | 168    | 🟢 Infrequent    |

**Total: ~98,583 errors | MotionOnLog: AreaAlarm 0/1 (~2,857 times)**

---

## WOORI-200G - Alarm Log (57+ Alarm Types, 11 Groups)

### 🔴 Group 1: Area Sensor - ~747,881 times

| Code    | Description                                  | Count   |
| ------- | -------------------------------------------- | ------- |
| **039** | 에어리어 센서 감지(전면) - Area Sensor Front | 563,004 |
| **040** | 에어리어 센서 감지(좌측) - Area Sensor Left  | 184,877 |

### 🟠 Group 2: Material Handling - ~47,580 times

| Code    | Description                                                       | Count  |
| ------- | ----------------------------------------------------------------- | ------ |
| **096** | 보조테이블 부자재 감지 실패 - Sub-table material detection failed | 18,965 |
| **043** | 헤드 부자재 픽업 실패 - Head material pickup failed               | 14,754 |
| **046** | 헤드의 부자재 제거 요망 - Material removal from head required     | 7,422  |
| **045** | 부자재 흐뜨러짐 발생 - Material scatter occurred                  | 3,881  |
| **042** | 헤드 부자재 부착 실패 - Head material attachment failed           | 1,438  |
| **093** | 분리부 부자재 감지 실패 - Separator material detection failed     | 1,098  |

### 🟡 Group 3: Head & Dual Attachment - ~12,880 times

| Code    | Description                                                    | Count |
| ------- | -------------------------------------------------------------- | ----- |
| **037** | 좌측 헤드 이중 부착 감지 - Left head dual attachment detected  | 7,334 |
| **038** | 우측 헤드 이중 부착 감지 - Right head dual attachment detected | 4,812 |
| **027** | 이중부착 오류 - Dual attachment error                          | 726   |

### 🔵 Group 4: Camera & Vision - ~14,391 times

| Code    | Description                                                        | Count  |
| ------- | ------------------------------------------------------------------ | ------ |
| **030** | 상부 카메라 패턴 감지 실패 - Upper camera pattern detection failed | 12,948 |
| **050** | 카메라 연결 이상 - Camera connection error                         | 635    |
| **049** | 티칭 데이터 이상 - Teaching data error                             | 468    |
| **036** | 부착마크 찾기 실패 - Attachment mark find failed (skip)            | 174    |
| **058** | 우측 헤드 마크 찾기 실패 - Right head mark find failed             | 86     |
| **057** | 좌측 헤드 마크 찾기 실패 - Left head mark find failed              | 70     |

### ⚡ Group 5: Motion & Axis - ~12,982 times

| Code        | Description                                                  | Count |
| ----------- | ------------------------------------------------------------ | ----- |
| **077**     | 이동범위 초과 - Movement range exceeded                      | 9,855 |
| **028**     | Home 안됨 - Homing failed                                    | 1,013 |
| **032**     | 모션 상태 알람 - Motion status alarm                         | 870   |
| **033**     | 모터 파워 꺼짐 - Motor power off                             | 754   |
| **081**     | 상부 카메라 X축 이동 시간 초과 - Upper camera X axis timeout | 266   |
| **084/083** | 헤드 R축 이동 시간 초과 - Head R axis timeout                | 106   |
| **080/079** | 헤드 Z축 이동 시간 초과 - Head Z axis timeout                | 44    |

### 🚪 Group 6: Door - ~1,928 times

| Code    | Description                       | Count |
| ------- | --------------------------------- | ----- |
| **017** | 문 열림(좌측) - Door open (Left)  | 741   |
| **018** | 문 열림(우측) - Door open (Right) | 476   |
| **016** | 문 열림(후면) - Door open (Rear)  | 407   |
| **015** | 문 열림(전면) - Door open (Front) | 304   |

### 🔥 Group 7: Heater - ~1,097 times

| Code    | Description                                                  | Count |
| ------- | ------------------------------------------------------------ | ----- |
| **053** | 분리테이블 히터 파워 꺼짐 - Separator table heater power off | 798   |
| **009** | 분리테이블 히터 과부하 - Separator table heater overload     | 148   |
| **003** | 메인테이블 히터 유닛 알람 - Main table heater overheat       | 61    |
| **008** | 메인테이블 히터 과부하 - Main table heater overload          | 49    |
| **004** | 분리테이블 히터 유닛 알람 - Separator table heater overheat  | 41    |

### 💨 Group 8: Air & Vacuum - ~750 times

| Code    | Description                                                    | Count |
| ------- | -------------------------------------------------------------- | ----- |
| **000** | 공압 이상 - Air pressure error                                 | 332   |
| **025** | 메인테이블 흡착 알람 - Main table vacuum alarm                 | 270   |
| **002** | 메인테이블 흡착 인버터 알람 - Main table vacuum inverter alarm | 122   |
| **090** | 메인테이블 흡착 안됨 - Main table vacuum failed                | 26    |

### 🛑 Group 9: Safety & Emergency - ~147 times

| Code    | Description                                             | Count |
| ------- | ------------------------------------------------------- | ----- |
| **007** | 긴급 정지 스위치 눌림 - Emergency stop switch pressed   | 141   |
| **089** | 헤드와 카메라 간 충돌 위험 - Head-camera collision risk | 6     |

### 📦 Group 10: Material Rewind - ~291 times

| Code    | Description                                           | Count |
| ------- | ----------------------------------------------------- | ----- |
| **014** | 부자재 REWIND 알람 - Subsidiary material rewind alarm | 147   |
| **013** | 이형지 REWIND 알람 - Release paper rewind alarm       | 144   |

### 📋 Group 11: Other - ~44 times

| Code    | Description                                       | Count |
| ------- | ------------------------------------------------- | ----- |
| **088** | 제품 없음 - No product detected                   | 30    |
| **051** | 선택된 가접 위치 없음 - No tack position selected | 14    |

---

# 📊 SUMMARY STATISTICS

| Machine        | Error Types                    | Total Count  |
| -------------- | ------------------------------ | ------------ |
| **Dawon HST**  | 13 types (11 Error + 2 Motion) | ~101,440     |
| **Woori-200G** | 57+ types (11 groups)          | ~839,971     |
| **TOTAL**      | **70+ types**                  | **~941,411** |

---

_Document generated - Date: 09/01/2026_
