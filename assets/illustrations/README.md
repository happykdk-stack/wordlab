# WordLab 그림동화 이미지 자동화

WordLab 성인용 단어(DATA)의 새 단어를 자동으로 감지해 그림을 만듭니다. **Kids와 학습 기록은 변경하지 않습니다.**

## 설정

GitHub 저장소 Settings → Secrets and variables → Actions → New repository secret에서 `OPENAI_API_KEY`를 등록합니다. 이 키는 ChatGPT 구독과 별개인 **OpenAI API 유료 이용**이 필요합니다. 키를 HTML/커밋에 넣지 않습니다.

## 실행

- 매일 한국시간 오전 **8시 30분**(UTC 23:30) 확인.
- `index.html` 또는 장면 설명 변경 시 자동 검사.
- Actions → **Generate storybook illustrations** → Run workflow → limit **71**로 시작하면 기존 71개도 생성 가능합니다. 초기 생성은 이미지당 과금이 발생하고 오래 걸릴 수 있습니다. 기본 자동 배치는 최대 10개씩 처리합니다.
- 로컬에서 `node scripts/generate-storybook.cjs --dry-run`으로 API 호출 없이 생성 예정 단어를 확인합니다.

## 처리 흐름

1. 성인 DATA의 영어 단어와 한글 뜻, `scene-descriptions.json`의 상황 설명을 결합합니다.
2. `1536×1024` 고해상도 그림동화 이미지를 생성합니다.
3. 파일 크기·WebP 형식·가로세로 비율·해상도·SHA256 중복을 검사합니다.
4. 비전 모델이 단어 의미 일치 및 혼잡·손/사물 겹침·문자 삽입 여부를 검토합니다. 통과하지 못하면 재시도하고 기존 그림을 보존합니다.
5. 통과한 이미지와 검사 기록을 `generated-manifest.json`에 저장하고 앱 이미지 매핑을 수정합니다.
6. 승인된 이미지만 GitHub에 커밋합니다. 사용자 로컬 학습 기록은 변경하지 않습니다.

## 주의

GitHub 저장소에 API 키가 설정되기 전에는 **새 이미지가 생성되지 않습니다**. 이미지 생성 과금 및 결과물 품질은 보장할 수 없으며 자동 품질 검사는 사람의 시각 검수를 완전히 대체하지 않습니다. 생성 실패 시 기존 SVG를 사용합니다. 새 단어 텍스트 자체를 추가하는 자동화와 이 그림 생성 파이프라인은 별개입니다. GitHub Actions의 일정 실행은 정확히 오전 8시 30분에 시작하지 않을 수 있습니다.
