import React from "react";

/**
 * 절대 크래시하지 않는 안전판 관리자 화면
 * - 훅/Firestore/Auth 호출 일절 없음
 * - App.js에서 넘겨주는 isAdminOverride만 신뢰
 * - 디버그 배너에 실제 전달된 값을 표시
 */
export default function UserAdmin({ isAdminOverride }) {
  const ok = isAdminOverride === true; // JSX에서 <UserAdmin isAdminOverride /> 라면 true가 들어옴

  return (
    <div className="p-6 space-y-4">
      {/* 디버그: App → UserAdmin Prop 전달 상태 확인용 */}
      <div className="text-xs bg-gray-100 border rounded p-2 font-mono">
        DEBUG isAdminOverride: {String(isAdminOverride)}
      </div>

      {ok ? (
        <div className="space-y-3">
          <div className="text-green-700 font-semibold">관리자 권한 확인됨</div>
          <div className="bg-white border rounded p-4">
            <h2 className="text-lg font-bold mb-2">관리자 도구</h2>
            <p className="text-sm text-gray-600">
              필요한 관리 기능을 여기에 배치하세요. (예: 사용자 목록, isAdmin 토글, 승인 대기 처리 등)
            </p>

            {/* 예시 버튼들 — 실제 기능을 붙일 자리 */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded border bg-gray-50 hover:bg-gray-100 text-sm"
                onClick={() => alert("여기에 '사용자 목록' 기능을 붙이세요.")}
              >
                사용자 목록 보기 (예시)
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded border bg-gray-50 hover:bg-gray-100 text-sm"
                onClick={() => alert("여기에 '승인 대기 처리' 기능을 붙이세요.")}
              >
                승인 대기 처리 (예시)
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-red-600">
          권한이 없습니다. (UserAdmin)
          <div className="text-xs text-gray-500 mt-2">
            * App.js에서 <code className="font-mono">{"<UserAdmin isAdminOverride />"}</code>로
            렌더링되고 있는지, 그리고 App 쪽의 관리자 가드가 true인지 확인하세요.
          </div>
        </div>
      )}
    </div>
  );
}
