# Safe Bike Seoul

## 로컬 실행

```bash
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 앱을 엽니다.

## API 설정

기존 `.env`에 키를 설정하세요. 새 환경에서는 [`.env.example`](.env.example)을 `.env`로 복사한 뒤 값을 입력하면 됩니다.

| 환경 변수 | 사용처 |
| --- | --- |
| `SEOUL_API_KEY` | 서버에서 서울 열린데이터광장 따릉이 실시간 대여정보 조회 |
| `DATA_GO_KR_API_KEY` | 서버에서 공공데이터포털 자전거 사고다발지역 및 기상청 단기예보 조회. 두 API의 활용 신청 필요 |
| `KAKAO_REST_API_KEY` | 서버에서 카카오 로컬 장소 검색 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 브라우저에서 카카오맵 SDK 초기화. 카카오 개발자 설정에 웹앱 도메인 등록 필요 |

Git에는 값이 비어 있는 `.env.example`만 포함하세요. 호스팅 환경에서는 서버 키를 배포 환경의 비밀 환경 변수에 등록하세요. 서울시 따릉이 API는 제공 기관의 공식 HTTP 주소를 사용하므로 서버와 서울시 API 사이의 통신은 암호화되지 않습니다.

| GET 요청 | 반환 데이터 |
| --- | --- |
| `/api/places?q=여의나루역` | 서울 중심 반경 20km의 카카오 장소 검색 결과 |
| `/api/stations?page=1&limit=100` | 따릉이 대여소 좌표 및 잔여 대수 |
| `/api/stations?lat=37.5271&lng=126.9328` | 출발지에서 직선거리 1.5km 이내의 가까운 따릉이 대여소 최대 8곳 |
| `/api/incidents?year=2021&district=560&page=1` | 서울 자치구의 해당 연도 자전거 사고다발지역 |
| `/api/incidents` | 실제 자료가 있는 최신 기준연도의 서울 전체 자전거 사고다발지역 |
| `/api/weather?lat=37.5271&lng=126.9328` | 출발지 격자의 다음 기온·강수확률 예보와 발표시각, 예보시각 |

API는 조회 결과를 JSON으로 반환합니다. 입력 오류는 400, 서버 키 미설정은 503, 외부 API 오류는 502로 반환합니다. 주변 대여소 조회는 서울시에서 가져온 자료를 최대 30초 동안 재사용합니다. 카카오모빌리티 자전거 길찾기 API 권한이 없어 앱은 출발지와 목적지만 지도에 표시합니다.

제공 기관의 인증 거부는 `provider_auth`(502)로 구분합니다. 대여소·장소·사고다발지역 검색 결과가 없으면 빈 목록을 반환하고, 유효한 단기예보 자료가 없으면 `no_data`(404)를 반환합니다.

카카오맵 SDK가 `domain mismatched`를 반환하면 카카오 개발자 설정의 JavaScript SDK 도메인에 브라우저에서 사용하는 주소의 스킴·호스트·포트를 등록하세요. 예를 들어 `http://127.0.0.1:3000`과 `http://localhost:3000`은 서로 다른 주소입니다.

## GitHub에 올리기

GitHub에서 빈 저장소를 만든 뒤 프로젝트 루트에서 실행합니다. `OWNER`와 `REPOSITORY`를 실제 값으로 바꾸세요.

```bash
git init -b main
git add .
git diff --cached --name-only
git commit -m "Prepare Safe Bike Seoul for deployment"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

커밋 전에 파일 목록에서 `.env`, `.env.local`, `.env.production`이 제외되고 빈 `.env.example`과 `package-lock.json`이 포함됐는지 확인합니다. `.next`, `node_modules`, `.vercel`은 Git에서 제외됩니다.

## Vercel 배포

1. **Add New → Project**에서 GitHub 저장소를 가져옵니다. Framework Preset은 **Next.js**, Root Directory는 **저장소 루트**로 선택합니다. 기본 빌드 설정을 사용하면 됩니다. [Vercel 빌드 설정](https://vercel.com/docs/builds)
2. 첫 배포 전에 **Environment Variables**에 위 표의 네 변수를 각각 등록합니다. 실제 값은 Vercel 설정에 직접 입력하고, 서버용 변수 세 개는 **Sensitive** 옵션을 사용하세요. 운영에는 **Production**, 미리보기에서는 필요에 따라 **Preview**에 설정합니다. 환경변수를 추가하거나 바꾼 뒤에는 다시 배포합니다. [Vercel 환경변수 설정](https://vercel.com/docs/environment-variables/managing-environment-variables)
3. 카카오 개발자 콘솔의 **앱 → 앱 설정 → 앱 → 플랫폼 키**에서 사용 중인 **JavaScript 키**를 선택하고 **JavaScript SDK 도메인**에 실제 운영 주소의 원본을 등록합니다. 예를 들어 `https://your-project.vercel.app`을 등록하고, 커스텀 도메인이나 Preview 주소에서도 지도를 사용한다면 실제로 접속하는 주소를 각각 등록합니다. `NEXT_PUBLIC_KAKAO_JS_KEY`는 빌드할 때 브라우저 번들에 포함되므로 도메인 제한을 적용하세요. [카카오 지도 Web API 가이드](https://apis.map.kakao.com/web/guide/)
4. 배포 URL에서 페이지와 카카오맵을 확인하고, 위 표의 API 요청을 실행해 각 데이터가 반환되는지 확인합니다. 따릉이 API는 배포 서버에서 서울시 공식 HTTP 주소의 **8088 포트**로 접속할 수 있어야 합니다. 로컬 빌드는 Vercel에서의 외부 API 연결까지 검증하지 않습니다.

로컬에서 프로덕션 모드로 확인할 수 있습니다.

```bash
npm run build
npm run start -- --port 3100
```
