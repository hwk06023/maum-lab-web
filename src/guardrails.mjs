// Conservative prototype checks. These are NOT comprehensive safety moderation.
export function inspectInput(text) {
  if (/(?:system|developer)\s*(?:prompt|message)|시스템\s*프롬프트|이전.{0,10}지시.{0,10}무시|즉시.{0,5}클리어|정답.{0,5}공개|reveal.{0,10}prompt/i.test(text))
    return { type: 'injection', message: '설정이나 클리어 조건을 바꾸는 요청은 적용하지 않습니다. 아이의 상황에 대한 질문으로 돌아가 주세요.' };
  if (/(?:01[016789][- ]?\d{3,4}[- ]?\d{4})|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\d{6}[- ]?[1-4]\d{6}/i.test(text))
    return { type: 'privacy', message: '연락처나 개인 식별정보로 보이는 내용이 있습니다. 실제 정보를 지우고 가상의 상황만 입력해 주세요.' };
  if (/죽고\s*싶|자살|자해|죽여\s*버|죽일\s*거|때려\s*버|때릴\s*거/.test(text))
    return { type: 'safety', message: '연습을 잠시 멈춥니다. 실제 위험에 관한 이야기라면 게임 대신 신뢰할 수 있는 어른이나 지역의 긴급 지원을 통해 안전을 먼저 확인해 주세요. 가상 장면이었다면 위협 없이 도울 방법으로 다시 시작해 주세요.' };
  if (/닥쳐|입\s*다물|시키는\s*대로|말\s*안\s*들으면|맞아야|멍청|바보야|무조건\s*복종/.test(text))
    return { type: 'coercion', message: '조용해지는 것과 어려움이 해결되는 것은 다릅니다. 위협하거나 모욕하지 않고, 방금 말을 수정해 볼 수 있어요.' };
  return null;
}
