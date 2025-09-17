import React from "react";

/**
 * 안전판 관리자 화면 (훅/파이어베이스 호출 없음)
 * - App에서 넘긴 isAdminOverride / probe만 신뢰
 */
export default function UserAdmin(props) {
  const { isAdminOverride, probe } = props || {};

  // ok 판정: isAdminOverride가 최우선, 없으면 probe 안의 불리언 시도
  const ok =
    isAdminOverride === true ||
    (probe && (probe.isAdmin === true || probe.ok === true));

  const debug = {
    isAdminOverride: isAdminOverride,
    probe: probe ?? null,
  };

  return (
    <div className="p-6 space-y-4">
      {/* 디버그: App → UserAdmin Prop 전달 상태 확인용 */}
      <div className="text-xs bg-gray-100 border rounded p-2 font-mono whitespace-pre-wrap">
        DEBUG props → {JSON.stringify(debug, null, 2)}
      </div>

      {ok ? (
        <div className="space-y-3">
          <div className="text-green-700 font-semibold">관리자 권한 확인됨</div>
          <div className="bg-white border rounded p-4">
            <h2 className="text-lg font-bold mb-2">관리자 도구</h2>
            <p className="text-sm text-gray-600">
              필요한 관리 기능을 여기에 배치하세요. (예: 사용자 목록, isAdmin 토글, 승인 대기 처리 등)
            </p>
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
            * App.js의 관리자 분기에서{" "}
            <code className="font-mono">&lt;UserAdmin isAdminOverride={"{isAdmin}"} /&gt;</code>
            로 렌더되고 있는지 확인하세요.
          </div>
        </div>
      )}
    </div>
  );
}
