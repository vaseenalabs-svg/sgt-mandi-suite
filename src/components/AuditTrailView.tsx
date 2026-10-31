import React, { useState } from 'react';
import { FileSearch, ShieldAlert, History, Search } from 'lucide-react';
import { AuditLogEntry } from '../shared/types';
import { LanguageCode, t } from '../shared/i18n';

interface AuditTrailViewProps {
  logs: AuditLogEntry[];
  lang: LanguageCode;
  onFilterLogs: (entityType: string, search: string) => Promise<void>;
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({
  logs,
  lang,
  onFilterLogs,
}) => {
  const [entityType, setEntityType] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(logs[0]?.id ?? null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await onFilterLogs(entityType, search);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>SRS Sections 17.3 & 18.1</span>
            <span aria-hidden="true">·</span>
            <span>Append-Only Immutable History</span>
            <span aria-hidden="true">·</span>
            <span>Automatic Sensitive Redaction</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t(lang, 'auditLogTitle')}</h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Every rate change, settings update, permission adjustment, number cancellation, and
            sensitive KYC unmasking is permanently logged with before/after values, user, and
            reason.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              onFilterLogs(e.target.value, search);
            }}
            className="apple-input text-xs py-2"
          >
            <option value="ALL">All Entity Types</option>
            <option value="COMPANY_SETTINGS">Company & Policy Settings</option>
            <option value="COMMODITY_MASTER">Commodity Master</option>
            <option value="STOCK_MOVEMENT">Stock Movements</option>
            <option value="NUMBER_SERIES">Document Number Series</option>
            <option value="ISSUED_DOCUMENT_NUMBER">Cancelled Numbers</option>
            <option value="USER_PERMISSIONS">User Permissions</option>
            <option value="FARMER_SENSITIVE_KYC">Sensitive KYC Access</option>
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search reason, ID, user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="apple-input pl-8 text-xs py-2 w-56"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Audit Log Table */}
      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">
              Recorded Audit Events ({logs.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500">Click any row to inspect Before / After diff</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/70 text-slate-500 bg-slate-50/60">
                <th className="py-3 px-4 font-medium">Timestamp (UTC/IST)</th>
                <th className="py-3 px-3 font-medium">Entity & ID</th>
                <th className="py-3 px-3 font-medium">Action</th>
                <th className="py-3 px-4 font-medium">Audit Reason</th>
                <th className="py-3 px-4 font-medium">Actor & Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50">
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="hover:bg-white/70 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {log.createdAt.slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">{log.entityType}</div>
                        <div className="text-[11px] font-mono text-slate-500">{log.entityId}</div>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-blue-600">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-md">{log.reason}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{log.userName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{log.userRole}</div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={5} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] font-mono">
                            <div className="glass-subtle rounded-2xl p-3.5 overflow-x-auto">
                              <div className="font-sans font-semibold text-slate-600 mb-1.5">
                                Original Values (Before)
                              </div>
                              <pre className="text-slate-700">
                                {log.beforeData
                                  ? JSON.stringify(log.beforeData, null, 2)
                                  : 'null (New Record / Action)'}
                              </pre>
                            </div>
                            <div className="glass-subtle rounded-2xl p-3.5 overflow-x-auto">
                              <div className="font-sans font-semibold text-slate-600 mb-1.5">
                                Corrected / Updated Values (After)
                              </div>
                              <pre className="text-slate-800">
                                {log.afterData
                                  ? JSON.stringify(log.afterData, null, 2)
                                  : 'null'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
