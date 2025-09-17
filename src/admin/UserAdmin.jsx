import React from "react";
import { CheckCircle2, ShieldAlert, Loader2 } from "lucide-react";

/**
 * 안전판 관리자 화면
 * - App.js에서 이미 관리자 가드를 통과한 뒤 렌더됩니다.
 * - 여기서는 런타임 예외를 절대 발생시키지 않도록 방어 로직만 둡니다.
 * - 관리자 기능(목록/승격/해제 등)은 추후 단계적으로 붙이세요.
 */
export default function UserAdmin({ isAdminOverride = false }) {
  // App 가드를 통과했더라도 방어적으로 상태를 유지
  const [ready, setReady] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(!!isAdminOverride);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    try {
      // 외부에서 true를 넘겨받으면 그대로 신뢰 (App 가드가 이미 판정)
      if (isAdminOverride === true) {
        setIsAdmin(true);
        setReady(true);
        return;
      }
      // 혹시 모를 예외 상황 대비: 기본값은 false지만 화면은 크래시 없이 렌더
      setIsAdmin(false);
      setReady(true);
    } catch (e) {
      // 어떤 예외도 화면 크래시로 이어지지 않도록 처리
      setError(e?.message || "알 수 없는 오류");
      setReady(true);
    }
  }, [isAdminOverride]);

  if (!ready) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>관리자 화면을 여는 중...</span>
        </div>
      </div>
    );
  }

  // 방어적으로 처리: isAdmin이 false라도 사용자에게 안내만, 크래시는 없음
  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 text-red-600">
          <ShieldAlert className="w-5 h-5 mt-0.5" />
          <div>
            <div className="font-semibold mb-1">권한이 없습니다.</div>
            <p className="text-sm text-gray-600">
              App 가드에서 보통 접근이 차단됩니다. 이 화면이 보인다면
              임시로 권한이 전달되지 않은 상태일 수 있습니다.
            </p>
          </div>
        </div>
        {error && (
          <div className="mt-3 text-xs text-gray-500">
            디버그: {error}
          </div>
        )}
      </div>
    );
  }

  // ✅ 관리자 확인됨: 여기부터 실제 기능을 점진적으로 추가하세요.
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle2 className="w-5 h-5" />
        <span className="font-semibold">관리자 권한 확인됨</span>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-lg font-bold mb-2">관리자 도구</h2>
        <p className="text-sm text-gray-600">
          필요한 관리 기능을 여기에 배치하세요.
          <br />
          예: 사용자 목록 조회, isAdmin 토글, 승인 대기 목록 처리 등.
        </p>

        {/* 예시: 나중에 기능을 붙일 자리 */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            className="px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-sm"
            onClick={() => alert("여기에 '사용자 목록' 기능을 붙이세요.")}
          >
            사용자 목록 보기 (예시 버튼)
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-sm"
            onClick={() => alert("여기에 '승인 대기 처리' 기능을 붙이세요.")}
          >
            승인 대기 처리 (예시 버튼)
          </button>
        </div>
      </div>
    </div>
  );
}
