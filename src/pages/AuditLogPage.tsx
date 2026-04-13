import { useEffect, useState, useCallback } from 'react'
import { Typography, Table, Card, Tag, Select, DatePicker, Space } from 'antd'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/api/supabase'
import { AUDIT_ACTION_LABELS, AUDIT_TARGET_LABELS } from '@/types'
import type { AuditLog } from '@/types'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const TARGET_FILTERS = [
  { value: 'user', label: '用户' },
  { value: 'role', label: '角色' },
  { value: 'project', label: '项目' },
  { value: 'member', label: '成员' },
]

const ACTION_FILTERS = Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export default function AuditLogPage() {
  const { isSuperAdmin, hasPermission } = useAuth()
  const canManageUsers = isSuperAdmin || hasPermission('manage_users')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [actionFilter, setActionFilter] = useState<string | undefined>()
  const [targetFilter, setTargetFilter] = useState<string | undefined>()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (actionFilter) {
      query = query.eq('action', actionFilter)
    }
    if (targetFilter) {
      query = query.eq('target_type', targetFilter)
    }
    if (dateRange && dateRange[0]) {
      query = query.gte('created_at', dateRange[0].startOf('day').toISOString())
    }
    if (dateRange && dateRange[1]) {
      query = query.lte('created_at', dateRange[1].endOf('day').toISOString())
    }

    const { data, count } = await query
    setLogs((data || []) as AuditLog[])
    setTotal(count || 0)
    setLoading(false)
  }, [page, pageSize, actionFilter, targetFilter, dateRange])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作者',
      dataIndex: 'actor_email',
      key: 'actor',
      width: 200,
      render: (v: string) => v || '-',
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 140,
      render: (v: string) => {
        const label = AUDIT_ACTION_LABELS[v] || v
        const color = v.startsWith('user') ? 'blue'
          : v.startsWith('role') ? 'purple'
          : v.startsWith('project') ? 'green'
          : v.startsWith('member') ? 'orange'
          : 'default'
        return <Tag color={color}>{label}</Tag>
      },
    },
    {
      title: '对象类型',
      dataIndex: 'target_type',
      key: 'target_type',
      width: 90,
      render: (v: string) => AUDIT_TARGET_LABELS[v] || v,
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (v: Record<string, unknown>) => {
        if (!v || Object.keys(v).length === 0) return '-'
        try {
          return <Text style={{ fontSize: 12 }}>{JSON.stringify(v)}</Text>
        } catch {
          return '-'
        }
      },
    },
  ]

  if (!canManageUsers) {
    return (
      <Card>
        <Title level={4}>审计日志</Title>
        <Text type="secondary">您没有权限查看此页面。</Text>
      </Card>
    )
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>审计日志</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap size={16}>
          <Space>
            <Text type="secondary">操作类型：</Text>
            <Select
              allowClear
              placeholder="全部"
              style={{ width: 150 }}
              value={actionFilter}
              onChange={(v) => { setActionFilter(v); setPage(1) }}
              options={ACTION_FILTERS}
            />
          </Space>
          <Space>
            <Text type="secondary">对象类型：</Text>
            <Select
              allowClear
              placeholder="全部"
              style={{ width: 120 }}
              value={targetFilter}
              onChange={(v) => { setTargetFilter(v); setPage(1) }}
              options={TARGET_FILTERS}
            />
          </Space>
          <Space>
            <Text type="secondary">时间范围：</Text>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)
                setPage(1)
              }}
              allowClear
            />
          </Space>
        </Space>
      </Card>

      <Card>
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{
            current: page,
            pageSize,
            total,
            showTotal: (t) => `共 ${t} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          }}
        />
      </Card>
    </div>
  )
}
