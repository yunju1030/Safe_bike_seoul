export async function fetchData<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const { code } = await response.json().catch(() => ({}));
    if (code === "provider_auth" || code === "not_configured") {
      throw new Error("데이터 제공 서비스의 인증 설정을 확인해 주세요.");
    }
    if (code === "no_data") throw new Error("표시할 자료가 없습니다.");
    throw new Error("자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return response.json() as Promise<T>;
}

export function requestMessage(error: unknown) {
  return error instanceof Error && !(error instanceof TypeError)
    ? error.message : "연결에 실패했습니다. 네트워크를 확인해 주세요.";
}
