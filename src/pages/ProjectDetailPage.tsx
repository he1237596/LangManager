import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { TablePaginationConfig } from 'antd/es/table'
import type { SorterResult } from 'antd/lib/table/interface'
import {
  Typography, Button, Table, Input, Space, Modal, Form, Tag, message, Popconfirm, Tooltip, Dropdown, Divider,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, ExportOutlined, SettingOutlined, EditOutlined,
  SearchOutlined, DownloadOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons'
import JSZip from 'jszip'
import { supabase } from '@/api/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Locale, TranslationRow, ProjectRole } from '@/types'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const ROLE_PERMISSIONS: Record<ProjectRole, { canAddKey: boolean; canEditKey: boolean; canEditValue: boolean; canDeleteKey: boolean; canManageLocale: boolean }> = {
  admin: { canAddKey: true, canEditKey: true, canEditValue: true, canDeleteKey: true, canManageLocale: true },
  developer: { canAddKey: false, canEditKey: true, canEditValue: false, canDeleteKey: false, canManageLocale: false },
  editor: { canAddKey: false, canEditKey: false, canEditValue: true, canDeleteKey: false, canManageLocale: false },
  viewer: { canAddKey: false, canEditKey: false, canEditValue: false, canDeleteKey: false, canManageLocale: false },
}

type SortField = 'key' | 'created_at' | 'updated_at'

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user, isSuperAdmin } = useAuth()
  const navigate = useNavigate()

  const [projectName, setProjectName] = useState('')
  const [locales, setLocales] = useState<Locale[]>([])
  const [rows, setRows] = useState<TranslationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [myRole, setMyRole] = useState<ProjectRole>('viewer')

  // Server-side pagination & search
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const searchKeyRef = useRef('')
  const searchTranslationRef = useRef('')
  const [searchKey, setSearchKey] = useState('')
  const [searchTranslation, setSearchTranslation] = useState('')
  const [showEmptyKeyOnly, setShowEmptyKeyOnly] = useState(false)
  const [sortField, setSortField] = useState<SortField>('key')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()

  // Add key modal
  const [addKeyOpen, setAddKeyOpen] = useState(false)
  const [addKeyForm] = Form.useForm()

  // Edit key modal
  const [editKeyOpen, setEditKeyOpen] = useState(false)
  const [editingKeyRecord, setEditingKeyRecord] = useState<TranslationRow | null>(null)
  const [editKeyForm] = Form.useForm()

  // Edit value modal
  const [editValueOpen, setEditValueOpen] = useState(false)
  const [editingCell, setEditingCell] = useState<{ keyId: string; localeId: string; localeName: string; currentValue: string; rowKey: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  const fetchMyRole = useCallback(async () => {
    if (!user || !projectId) return
    if (isSuperAdmin) {
      setMyRole('admin')
      return
    }
    const { data } = await supabase
      .from('project_member_roles')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()
    if (data) setMyRole(data.role as ProjectRole)
  }, [user, projectId, isSuperAdmin])

  const fetchLocales = useCallback(async () => {
    if (!projectId) return
    const { data } = await supabase
      .from('locales')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
    setLocales(data || [])
  }, [projectId])

  const fetchTranslations = useCallback(async (
    page: number,
    size: number,
    key: string,
    trans: string,
    emptyOnly: boolean,
    sField: SortField,
    sOrder: 'asc' | 'desc',
  ) => {
    if (!projectId) return
    setLoading(true)

    let query = supabase
      .from('translation_keys')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)

    if (emptyOnly) {
      query = query.is('key', null)
    } else if (key) {
      query = query.or(`key.ilike.%${key}%,description.ilike.%${key}%`)
    }

    query = query.order(sField, { ascending: sOrder === 'asc', nullsFirst: false })

    const from = (page - 1) * size
    const to = from + size - 1
    query = query.range(from, to)

    const { data: keys, count } = await query
    setTotalCount(count || 0)

    const keyIds = (keys || []).map(k => k.id)
    let transMap: Record<string, Record<string, { id: string; value: string; localeId: string }>> = {}

    if (keyIds.length > 0) {
      const { data: translations } = await supabase
        .from('translations')
        .select('*')
        .in('key_id', keyIds)

      for (const t of translations || []) {
        if (!transMap[t.key_id]) transMap[t.key_id] = {}
        transMap[t.key_id][t.locale_id] = { id: t.id, value: t.value, localeId: t.locale_id }
      }
    }

    const result: TranslationRow[] = (keys || []).map((k) => ({
      keyId: k.id,
      key: k.key,
      description: k.description,
      created_at: k.created_at,
      updated_at: k.updated_at,
      translations: transMap[k.id] || {},
    }))

    let filtered = result
    if (trans) {
      filtered = result.filter(r =>
        Object.values(r.translations).some(t => t.value && t.value.toLowerCase().includes(trans.toLowerCase()))
      )
    }

    setRows(filtered)
    setLoading(false)
  }, [projectId])

  const fetchProjectName = useCallback(async () => {
    if (!projectId) return
    const { data } = await supabase.from('projects').select('name').eq('id', projectId).single()
    if (data) setProjectName(data.name)
  }, [projectId])

  useEffect(() => {
    fetchMyRole()
    fetchLocales()
    fetchProjectName()
  }, [fetchMyRole, fetchLocales, fetchProjectName])

  // Initial load
  useEffect(() => {
    fetchTranslations(1, pageSize, '', '', false, sortField, sortOrder)
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const doFetch = () => {
    fetchTranslations(currentPage, pageSize, searchKeyRef.current, searchTranslationRef.current, showEmptyKeyOnly, sortField, sortOrder)
  }

  const perms = ROLE_PERMISSIONS[myRole]

  // --- Add Key ---
  const [translationValues, setTranslationValues] = useState<Record<string, string>>({})

  const openAddKey = () => {
    addKeyForm.resetFields()
    const vals: Record<string, string> = {}
    for (const l of locales) vals[l.id] = ''
    setTranslationValues(vals)
    setAddKeyOpen(true)
  }

  const handleAddKey = async (values: { key?: string; description?: string }) => {
    if (!projectId) return
    const hasTranslation = Object.values(translationValues).some(v => v && v.trim())
    if (!hasTranslation) {
      message.warning('请至少填写一种语言的翻译内容')
      return
    }
    const keyValue = values.key?.trim() || ''
    const { data: newKey, error } = await supabase
      .from('translation_keys')
      .insert({ project_id: projectId, key: keyValue, description: values.description || null })
      .select()
      .single()

    if (error) { message.error('添加失败: ' + error.message); return }

    // Create translations for all locales
    const inserts = locales.map(locale => ({
      key_id: newKey.id,
      locale_id: locale.id,
      value: translationValues[locale.id] || '',
      updated_by: user!.id,
    }))
    if (inserts.length > 0) {
      await supabase.from('translations').insert(inserts)
    }

    message.success('Key 添加成功')
    setAddKeyOpen(false)
    addKeyForm.resetFields()
    doFetch()
  }

  // --- Edit Key ---
  const openEditKey = (record: TranslationRow) => {
    setEditingKeyRecord(record)
    editKeyForm.setFieldsValue({ key: record.key, description: record.description })
    setEditKeyOpen(true)
  }

  const handleEditKey = async (values: { key: string; description?: string }) => {
    if (!editingKeyRecord) return
    const { error } = await supabase
      .from('translation_keys')
      .update({ key: values.key.trim(), description: values.description || null, updated_at: new Date().toISOString() })
      .eq('id', editingKeyRecord.keyId)
    if (error) { message.error('更新失败: ' + error.message); return }
    message.success('Key 已更新')
    setEditKeyOpen(false)
    setEditingKeyRecord(null)
    editKeyForm.resetFields()
    doFetch()
  }

  // --- Edit Translation Value ---
  const openEditValue = (keyId: string, localeId: string, localeName: string, currentValue: string, keyName: string) => {
    setEditingCell({ keyId, localeId, localeName, currentValue, rowKey: keyName })
    setEditValue(currentValue)
    setEditValueOpen(true)
  }

  const handleSaveValue = async () => {
    if (!editingCell || !user) return

    const existing = rows.find(r => r.keyId === editingCell.keyId)?.translations[editingCell.localeId]
    if (existing) {
      const { error } = await supabase.from('translations')
        .update({ value: editValue, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) { message.error('保存失败'); return }
    } else {
      const { error } = await supabase.from('translations').insert({
        key_id: editingCell.keyId,
        locale_id: editingCell.localeId,
        value: editValue,
        updated_by: user.id,
      })
      if (error) { message.error('保存失败'); return }
    }

    message.success('保存成功')
    setEditValueOpen(false)
    setEditingCell(null)
    doFetch()
  }

  // --- Row Edit (description + all translations) ---
  const [rowEditRecord, setRowEditRecord] = useState<TranslationRow | null>(null)
  const [rowEditDesc, setRowEditDesc] = useState('')
  const [rowEditValues, setRowEditValues] = useState<Record<string, string>>({})
  const [rowEditLoading, setRowEditLoading] = useState(false)

  const openRowEdit = (record: TranslationRow) => {
    setRowEditRecord(record)
    setRowEditDesc(record.description || '')
    const vals: Record<string, string> = {}
    for (const locale of locales) {
      vals[locale.id] = record.translations[locale.id]?.value || ''
    }
    setRowEditValues(vals)
  }

  const handleRowEditSave = async () => {
    if (!rowEditRecord || !user) return
    setRowEditLoading(true)
    try {
      // Update description
      await supabase
        .from('translation_keys')
        .update({ description: rowEditDesc || null, updated_at: new Date().toISOString() })
        .eq('id', rowEditRecord.keyId)

      // Update each translation value
      for (const locale of locales) {
        const val = rowEditValues[locale.id] || ''
        const existing = rowEditRecord.translations[locale.id]
        if (existing) {
          await supabase.from('translations')
            .update({ value: val, updated_by: user.id, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
        } else if (val) {
          await supabase.from('translations').insert({
            key_id: rowEditRecord.keyId,
            locale_id: locale.id,
            value: val,
            updated_by: user.id,
          })
        }
      }

      message.success('保存成功')
      setRowEditRecord(null)
      doFetch()
    } catch {
      message.error('保存失败')
    }
    setRowEditLoading(false)
  }

  // Delete Key state
  const [deleteKeyRecord, setDeleteKeyRecord] = useState<TranslationRow | null>(null)
  const [deleteKeyConfirm, setDeleteKeyConfirm] = useState('')
  const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false)

  const handleDeleteClick = (record: TranslationRow) => {
    if (record.key) {
      setDeleteKeyRecord(record)
      setDeleteKeyConfirm('')
    } else {
      handleDeleteKey(record.keyId)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteKeyRecord) return
    if (deleteKeyConfirm !== deleteKeyRecord.key) {
      message.warning('输入的 Key 不匹配')
      return
    }
    setDeleteConfirmLoading(true)
    await handleDeleteKey(deleteKeyRecord.keyId)
    setDeleteConfirmLoading(false)
    setDeleteKeyRecord(null)
  }

  const handleDeleteKey = async (keyId: string) => {
    const { error } = await supabase.from('translation_keys').delete().eq('id', keyId)
    if (error) { message.error('删除失败'); return }
    message.success('Key 已删除')
    doFetch()
  }

  // --- Export JSON (single locale) ---
  const handleExport = async (localeId: string) => {
    const locale = locales.find(l => l.id === localeId)
    if (!locale || !projectId) return
    message.loading({ content: '正在导出...', key: 'export' })
    const { data: keys } = await supabase
      .from('translation_keys')
      .select('id, key')
      .eq('project_id', projectId)
    const { data: translations } = await supabase
      .from('translations')
      .select('key_id, value')
      .eq('locale_id', localeId)
      .in('key_id', (keys || []).map(k => k.id))
    const transMap: Record<string, string> = {}
    for (const t of translations || []) {
      const k = keys?.find(k => k.id === t.key_id)
      if (k) transMap[k.key || `__null_${k.id}`] = t.value
    }
    const blob = new Blob([JSON.stringify(transMap, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}_${locale.code}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success({ content: '导出成功', key: 'export' })
  }

  // --- Export All Locales as ZIP ---
  const [exporting, setExporting] = useState(false)
  const handleExportAll = async () => {
    if (locales.length === 0) { message.warning('没有语言可导出'); return }
    setExporting(true)
    try {
      const zip = new JSZip()
      if (!projectId) return
      const { data: keys } = await supabase
        .from('translation_keys')
        .select('id, key')
        .eq('project_id', projectId)
      const { data: translations } = await supabase
        .from('translations')
        .select('key_id, locale_id, value')
        .in('key_id', (keys || []).map(k => k.id))

      for (const locale of locales) {
        const obj: Record<string, string> = {}
        for (const t of (translations || []).filter(t => t.locale_id === locale.id)) {
          const k = keys?.find(k => k.id === t.key_id)
          if (k) obj[k.key || `__null_${k.id}`] = t.value
        }
        zip.file(`${locale.code}.json`, JSON.stringify(obj, null, 2))
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName}_translations.zip`
      a.click()
      URL.revokeObjectURL(url)
      message.success(`已导出 ${locales.length} 个语言文件`)
    } catch {
      message.error('导出失败')
    }
    setExporting(false)
  }

  // --- Handlers ---
  const handleSearchKeyChange = (value: string) => {
    setSearchKey(value)
    searchKeyRef.current = value
    setCurrentPage(1)
    if (value && showEmptyKeyOnly) setShowEmptyKeyOnly(false)
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      fetchTranslations(1, pageSize, value, searchTranslationRef.current, value ? false : showEmptyKeyOnly, sortField, sortOrder)
    }, 400)
  }

  const handleSearchTranslationChange = (value: string) => {
    setSearchTranslation(value)
    searchTranslationRef.current = value
    setCurrentPage(1)
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      fetchTranslations(1, pageSize, searchKeyRef.current, value, showEmptyKeyOnly, sortField, sortOrder)
    }, 400)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleTableChange = (pagination: TablePaginationConfig, _filters: any, sorter: SorterResult<TranslationRow> | SorterResult<TranslationRow>[]) => {
    const page = pagination.current || 1
    const size = pagination.pageSize || 50
    setCurrentPage(page)
    setPageSize(size)
    const s = Array.isArray(sorter) ? sorter[0] : sorter
    let newField = sortField
    let newOrder = sortOrder
    if (s.field && s.order) {
      newField = s.field as SortField
      newOrder = s.order === 'ascend' ? 'asc' : 'desc'
      setSortField(newField)
      setSortOrder(newOrder)
    }
    fetchTranslations(page, size, searchKeyRef.current, searchTranslationRef.current, showEmptyKeyOnly, newField, newOrder)
  }

  const handleToggleEmptyKey = () => {
    const newVal = !showEmptyKeyOnly
    setShowEmptyKeyOnly(newVal)
    setCurrentPage(1)
    fetchTranslations(1, pageSize, searchKeyRef.current, searchTranslationRef.current, newVal, sortField, sortOrder)
  }

  const columns = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      width: 250,
      fixed: 'left' as const,
      sorter: true,
      sortOrder: sortField === 'key' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : undefined,
      render: (text: string, record: TranslationRow) => (
        <div
          style={{ cursor: perms.canEditKey ? 'pointer' : 'default', minHeight: 22 }}
          onClick={() => { if (perms.canEditKey) openEditKey(record) }}
        >
          <Space>
            <Text code style={{ fontSize: 13 }}>{text || <Text type="secondary" style={{ fontSize: 12 }}>待填写</Text>}</Text>
            {record.description && (
              <Tooltip title={record.description}>
                <Text type="secondary" ellipsis style={{ maxWidth: 120, fontSize: 12 }}>
                  {record.description}
                </Text>
              </Tooltip>
            )}
          </Space>
        </div>
      ),
    },
    ...locales.map(locale => ({
      title: (
        <Dropdown
          menu={{
            items: [
              { key: 'export', icon: <ExportOutlined />, label: '导出 JSON', onClick: () => handleExport(locale.id) },
            ],
          }}
        >
          <Space style={{ cursor: 'pointer' }}>
            {locale.name}
            <Text type="secondary" style={{ fontSize: 11 }}>{locale.code}</Text>
            {locale.is_default && <Tag color="blue" style={{ marginLeft: 2 }}>默认</Tag>}
          </Space>
        </Dropdown>
      ),
      key: locale.id,
      width: 220,
      render: (_: unknown, record: TranslationRow) => {
        const t = record.translations[locale.id]
        const val = t?.value || ''
        const isEmpty = !val
        return (
          <div
            style={{
              cursor: perms.canEditValue ? 'pointer' : 'default',
              minHeight: 32,
              padding: '2px 8px',
              borderRadius: 4,
              border: isEmpty ? '1px dashed #d9d9d9' : '1px solid transparent',
              background: isEmpty ? '#fafafa' : 'transparent',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            onClick={() => {
              if (perms.canEditValue) openEditValue(record.keyId, locale.id, locale.name, val, record.key || '')
            }}
          >
            <Text type={isEmpty ? 'secondary' : undefined} style={{ fontSize: 13 }}>
              {isEmpty ? '点击编辑' : val}
            </Text>
          </div>
        )
      },
    })),
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      sorter: true,
      sortOrder: sortField === 'created_at' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : undefined,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '编辑时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      sorter: true,
      sortOrder: sortField === 'updated_at' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : undefined,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    ...((perms.canAddKey || perms.canEditKey || perms.canEditValue || perms.canDeleteKey) ? [{
      title: '操作',
      key: 'actions',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, record: TranslationRow) => (
        <Space size={4}>
          {(perms.canEditKey && perms.canEditValue) && (
            <Button type="text" icon={<EditOutlined />} size="small" onClick={() => openRowEdit(record)} />
          )}
          {perms.canDeleteKey && (
            record.key
              ? <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={() => handleDeleteClick(record)} />
              : (
                <Popconfirm
                  title="确认删除此记录？"
                  description="关联的所有翻译也将被删除"
                  onConfirm={() => handleDeleteKey(record.keyId)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
              )
          )}
        </Space>
      ),
    }] : []),
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          {(myRole === 'admin' || isSuperAdmin) && (
            <Button icon={<SettingOutlined />} onClick={() => navigate(`/project/${projectId}/settings`)}>
              项目设置
            </Button>
          )}
          <Title level={4} style={{ margin: 0 }}>{projectName} - 翻译管理</Title>
        </Space>
        <Space>
          <Input
            placeholder="搜索 Key / 描述..."
            prefix={<SearchOutlined />}
            value={searchKey}
            onChange={e => handleSearchKeyChange(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Input
            placeholder="搜索翻译内容..."
            prefix={<SearchOutlined />}
            value={searchTranslation}
            onChange={e => handleSearchTranslationChange(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Button
            icon={<ExclamationCircleOutlined />}
            onClick={handleToggleEmptyKey}
            danger={showEmptyKeyOnly}
          >
            未填 Key{showEmptyKeyOnly ? ` (${totalCount})` : ''}
          </Button>
          {perms.canAddKey && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddKey}>
              添加
            </Button>
          )}
          <Button icon={<DownloadOutlined />} onClick={handleExportAll} loading={exporting}>
            导出全部
          </Button>
        </Space>
      </div>

      <Table
        dataSource={rows}
        columns={columns as any}
        rowKey="keyId"
        loading={loading}
        scroll={{ x: 500 + locales.length * 220 }}
        pagination={{
          current: currentPage,
          pageSize,
          total: totalCount,
          showTotal: total => `共 ${total} 条`,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
        }}
        onChange={handleTableChange}
        size="middle"
      />

      {/* Add Key Modal */}
      <Modal
        title="添加翻译"
        open={addKeyOpen}
        onOk={() => addKeyForm.submit()}
        onCancel={() => { setAddKeyOpen(false); addKeyForm.resetFields() }}
        okText="添加"
        cancelText="取消"
        width={640}
      >
        <Form form={addKeyForm} layout="vertical" onFinish={handleAddKey}>
          <Form.Item
            name="key"
            label="Key 名称"
            tooltip="可选，由开发后续补充。"
            rules={[
              { pattern: /^[a-zA-Z][a-zA-Z0-9._-]*$/, message: 'Key 只能包含字母、数字、点、下划线、短横线，且以字母开头' },
            ]}
          >
            <Input placeholder="可选，例如：home.title" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="可选的描述信息" />
          </Form.Item>
        </Form>
        {locales.length > 0 && (
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 8 }}>
            <Text strong style={{ marginBottom: 12, display: 'block' }}>翻译内容</Text>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {locales.map(locale => (
                <div key={locale.id} style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {locale.name}
                    <Text code style={{ marginLeft: 4 }}>{locale.code}</Text>
                    {locale.is_default && <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>默认</Tag>}
                  </Text>
                  <Input.TextArea
                    rows={2}
                    value={translationValues[locale.id] || ''}
                    onChange={e => setTranslationValues(prev => ({ ...prev, [locale.id]: e.target.value }))}
                    placeholder={`${locale.name} 翻译...`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {locales.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#999' }}>
            请先在项目设置中添加语言
          </div>
        )}
      </Modal>

      {/* Edit Key Modal */}
      <Modal
        title="编辑 Key"
        open={editKeyOpen}
        onOk={() => editKeyForm.submit()}
        onCancel={() => { setEditKeyOpen(false); setEditingKeyRecord(null); editKeyForm.resetFields() }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editKeyForm} layout="vertical" onFinish={handleEditKey}>
          <Form.Item
            name="key"
            label="Key 名称"
            rules={[
              { required: true, message: '请输入 Key' },
              { pattern: /^[a-zA-Z][a-zA-Z0-9._-]*$/, message: 'Key 只能包含字母、数字、点、下划线、短横线' },
            ]}
          >
            <Input placeholder="例如：home.title、common.submit" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="可选的描述信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Translation Value Modal */}
      <Modal
        title={editingCell ? `编辑翻译 - ${editingCell.localeName}` : '编辑翻译'}
        open={editValueOpen}
        onOk={handleSaveValue}
        onCancel={() => { setEditValueOpen(false); setEditingCell(null) }}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        {editingCell && (
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">Key: </Text>
            <Text code>{editingCell.rowKey || '待填写'}</Text>
          </div>
        )}
        <Input.TextArea
          rows={6}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          placeholder="输入翻译文本..."
        />
      </Modal>

      {/* Row Edit Modal */}
      <Modal
        title={rowEditRecord ? `编辑翻译${rowEditRecord.key ? ` - ${rowEditRecord.key}` : ''}` : '编辑翻译'}
        open={!!rowEditRecord}
        onCancel={() => setRowEditRecord(null)}
        onOk={handleRowEditSave}
        okText="保存"
        cancelText="取消"
        width={640}
        confirmLoading={rowEditLoading}
      >
        {rowEditRecord && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary">Key: </Text>
              <Text code>{rowEditRecord.key || '待填写'}</Text>
            </div>
            <Form.Item label="描述">
              <Input
                value={rowEditDesc}
                onChange={e => setRowEditDesc(e.target.value)}
                placeholder="可选的描述信息"
              />
            </Form.Item>
            <Divider style={{ margin: '8px 0 12px' }}>翻译内容</Divider>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {locales.map(locale => (
                <div key={locale.id} style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {locale.name}
                    <Text code style={{ marginLeft: 4 }}>{locale.code}</Text>
                    {locale.is_default && <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>默认</Tag>}
                  </Text>
                  <Input.TextArea
                    rows={2}
                    value={rowEditValues[locale.id] || ''}
                    onChange={e => setRowEditValues(prev => ({ ...prev, [locale.id]: e.target.value }))}
                    placeholder={`${locale.name} 翻译...`}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* Delete Key Confirmation Modal */}
      <Modal
        title={<span style={{ color: '#ff4d4f' }}>危险操作 - 删除 Key</span>}
        open={!!deleteKeyRecord}
        onCancel={() => setDeleteKeyRecord(null)}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: deleteConfirmLoading }}
        onOk={handleConfirmDelete}
      >
        <div style={{ marginTop: 16 }}>
          <Text>此操作将删除 Key <Text code>{deleteKeyRecord?.key}</Text> 及其所有翻译，且不可恢复。</Text>
          <div style={{ marginTop: 16 }}>
            <Text type="danger">请输入 Key 名称以确认删除：</Text>
            <Input
              style={{ marginTop: 8 }}
              placeholder={deleteKeyRecord?.key}
              value={deleteKeyConfirm}
              onChange={e => setDeleteKeyConfirm(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
