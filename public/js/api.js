export async function requestTranslation(payload) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || '翻译暂时不可用，请稍后重试。');
  }
  return body;
}
