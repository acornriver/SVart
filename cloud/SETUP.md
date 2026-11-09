# 청감 클라우드 — Firebase 설정 가이드

> 작업자가 직접 해야 하는 단계들. Claude가 대신할 수 없음.

---

## 1. Firebase 프로젝트 만들기

1. [Firebase 콘솔](https://console.firebase.google.com) → "프로젝트 추가"
2. 프로젝트 이름: `svart-sound` (또는 원하는 이름)
3. Google Analytics: 선택 사항 (나중에 사용하지 않으면 꺼도 됨)

---

## 2. Blaze 플랜 전환 + 예산 알림

1. 콘솔 → "업그레이드" → Blaze(종량제) 선택
   - Spark(무료) 플랜에서는 Firestore 외부 쓰기 불가
2. 예산 알림 설정: 콘솔 → 사용량 및 결제 → 예산 경고
   - **₩20,000** 도달 시 이메일 알림 (결제를 막지는 않음, 알림일 뿐)
   - 필요하면 Cloud Billing에서 결제 계정에 예산 적용 가능

---

## 3. Firestore 데이터베이스 생성

1. 콘솔 → Firestore Database → "데이터베이스 만들기"
2. 모드: **프로덕션 모드** (규칙은 아래에서 배포)
3. 위치: **asia-northeast3 (Seoul)**

---

## 4. 웹 앱 등록 + Firebase 설정 붙여넣기

1. 콘솔 → 프로젝트 개요 → "</>" (웹 앱 추가)
2. 앱 별명: `svart-ipad` (또는 원하는 이름)
3. Firebase 호스팅: **체크 안 함** (GitHub Pages 사용)
4. 등록 후 나오는 `firebaseConfig` 객체를 `cloud/config.js`의 `FIREBASE_CONFIG`에 붙여넣기:

```js
FIREBASE_CONFIG: {
  apiKey: "AIza...",
  authDomain: "svart-sound.firebaseapp.com",
  projectId: "svart-sound",
  storageBucket: "svart-sound.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
},
```

---

## 5. Firebase CLI 설치 + 로그인

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # 프로젝트 선택
```

---

## 6. 보안 규칙 + 인덱스 배포

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

- 규칙 파일: `firestore.rules`
- 인덱스 파일: `firestore.indexes.json`

---

## 7. reCAPTCHA Enterprise 설정 + App Check

1. [Google Cloud Console](https://console.cloud.google.com) → Firebase 프로젝트 선택
2. API & Services → "reCAPTCHA Enterprise" 활성화
3. "키 만들기" → 웹 플랫폼, 도메인: `acornriver.github.io`
4. 생성된 사이트 키를 `cloud/config.js`의 `APP_CHECK_SITE_KEY`에 붙여넣기
5. Firebase 콘솔 → App Check → 앱 등록 → reCAPTCHA Enterprise 선택 + 키 입력
6. **App Check 강제 적용은 아직 하지 말 것**
   - 먼저 GitHub Pages에 배포 후 실제 아이패드에서 접속
   - 콘솔 → App Check → "요청 지표"에서 **인증된 요청 비율이 95% 이상**인지 확인
   - 확인 후 "강제 적용" 버튼 클릭

---

## 8. 아이패드별 seat 주소

각 아이패드 Safari 북마크를:

```
https://acornriver.github.io/SVartSoft/?seat=1
https://acornriver.github.io/SVartSoft/?seat=2
...
https://acornriver.github.io/SVartSoft/?seat=6
```

또는 아이패드에서 한 번 접속 후 콘솔에서:
```js
localStorage.setItem('svart.seat', '1');  // 1~6
```

---

## 9. 맥 스튜디오 Chrome 키오스크 실행

TV용 청감 타워 페이지 (B 작업 완료 후):

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --kiosk \
  --disable-pinch \
  --noerrdialogs \
  --disable-infobars \
  "https://acornriver.github.io/SVartSoft/tower/"
```

또는 전체화면으로 열고 Cmd+Shift+F:
```bash
open -a "Google Chrome" "https://acornriver.github.io/SVartSoft/tower/"
```

---

## 10. 콘솔에서 문서 숨기기 (`hidden: true`)

적절하지 않은 이름이나 테스트 데이터를 숨길 때:

1. Firebase 콘솔 → Firestore → `ears` 컬렉션
2. 해당 문서 클릭 → `hidden` 필드를 `false` → `true`로 변경
3. 보안 규칙상 클라이언트에서 update가 불가하므로 반드시 콘솔에서

규칙: `hidden == true`인 문서는 모든 클라이언트 쿼리에서 필터링됨.

---

## 11. rejected 항목 꺼내기

아이패드에서 콘솔 열기 (Safari → 개발자 도구) 후:

```js
window.svartCloud.dumpRejected()
```

또는 직접:
```js
JSON.parse(localStorage.getItem('svart.outbox.rejected') || '[]')
```

---

## 12. 에뮬레이터 로컬 테스트

```bash
# Firebase 에뮬레이터 시작 (firestore만)
# Java가 필요함: brew install openjdk@21 (시스템에 안 잡히므로 PATH를 앞에 붙임)
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH firebase emulators:start --only firestore --project svart-test

# 앱 서버
python3 -m http.server 8765

# 에뮬레이터 모드로 접속 (실서버에 쓰지 않음)
http://localhost:8765/?emulator=1

# 규칙 테스트 실행
cd tests/cloud && npm install && node rules.test.mjs

# 전송과 피드 테스트 (레포 루트에서, 출력 폴더는 절대경로)
node tests/e2e/cloud-flow.mjs <출력폴더>
node tests/e2e/feed.mjs <출력폴더>
```

---

## 13. 하룻밤 시험 방법

1. App Check 강제 적용 **전에** 하룻밤 운영 테스트
2. `?debug=1` URL로 아이패드 접속 → 화면 왼쪽 아래 전송 상태 확인
3. 다음 날 Firebase 콘솔 → Firestore → `ears` 컬렉션에 문서가 쌓였는지 확인
4. App Check 지표 확인 후 강제 적용

---

## 14. TV 화면 (청감 타워, 별도 레포)

TV 화면은 이 레포가 아니라 별도 레포(청감 타워)에서 띄운다. 타워 레포는 이 레포의 `cloud/config.js`, `cloud/firebase.js`, `cloud/feed.js`를 복사해 간다. 고칠 때는 이 레포를 먼저 고치고 타워 레포로 복사한다.

타워를 `acornriver.github.io`가 아닌 다른 도메인에 올리면 reCAPTCHA 키의 허용 도메인에 그 도메인을 추가해야 한다. 안 하면 App Check 강제 적용 뒤 TV가 빈다.

---

## 15. App Check 강제 적용 전 확인 목록

- [ ] `node tests/cloud/unit.test.mjs` 통과 (App Check 실패 시 대기열 유지 포함)
- [ ] 콘솔 App Check 지표에서 확인된 요청 비율 확인
- [ ] 아이패드와 TV 실기기로 하룻밤 시험 (13장)
- [ ] 타워 도메인이 reCAPTCHA 키에 등록됨 (14장)

---

## 미확정 (원우리 작가 확인 필요)

- `STORE_NAMES`: 이름 저장 여부 (기본 `false`)
- `SHOW_NAMES`: TV에서 이름 표시 여부 (기본 `false`)
- `BANNED_WORDS`: 금칙어 목록 (기본 비어 있음)
- 전시 기간, 보관 기간
- 관리자 숨기기 페이지 (지금은 콘솔에서 직접)
