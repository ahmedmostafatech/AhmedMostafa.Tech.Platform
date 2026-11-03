// ============================================================
// admin-reports-page.js
// منطق صفحة التقارير وتصدير كشف Excel (CSV)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import { getAllRegistrations, getAllRevisions } from '../../services/admin-service.js';
import { formatPrice, formatDateTime } from '../../core/utils.js';

let cachedRegistrations = [];

async function updateReportPreview() {
  let courseVal = document.getElementById('export-course').value;
  let statusVal = document.getElementById('export-status').value;
  let branchVal = document.getElementById('export-branch').value;

  let filtered = cachedRegistrations.filter(function (r) {
    if (courseVal !== 'all' && r.course_id !== courseVal) return false;
    if (statusVal !== 'all' && r.payment_status !== statusVal) return false;
    if (branchVal !== 'all' && r.branch !== branchVal) return false;
    return true;
  });

  let countEl = document.getElementById('export-match-count');
  let revEl = document.getElementById('export-match-revenue');

  if (countEl) countEl.textContent = `${filtered.length} طالب`;

  let totalRevenue = filtered
    .filter(function (r) { return r.payment_status === 'paid'; })
    .reduce(function (sum, r) { return sum + Number(r.amount || 0); }, 0);

  if (revEl) revEl.textContent = formatPrice(totalRevenue);

  return filtered;
}

function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

async function downloadCSV() {
  let filtered = await updateReportPreview();

  if (filtered.length === 0) {
    alert('لا توجد سجلات مطابقة للفلترة الحالية لتصديرها.');
    return;
  }

  // الترويسة العربية
  let headers = [
    'كود التسجيل',
    'اسم الطالب',
    'الفرع الجامعي',
    'رقم الهاتف',
    'البريد الإلكتروني',
    'المراجعة',
    'المبلغ (ج.م)',
    'وسيلة الدفع',
    'حالة الدفع',
    'تاريخ التسجيل',
    'تاريخ الاعتماد',
    'ملاحظات الأدمن'
  ];

  let rows = [headers.map(escapeCsvField).join(',')];

  filtered.forEach(function (r) {
    let courseTitle = r.courses ? r.courses.title : '';
    let methodText = r.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';
    let statusText = '';
    switch (r.payment_status) {
      case 'paid': statusText = 'مؤكد (Paid)'; break;
      case 'under_review': statusText = 'قيد المراجعة'; break;
      case 'pending_payment': statusText = 'بانتظار التحويل'; break;
      case 'rejected': statusText = 'مرفوض'; break;
      default: statusText = r.payment_status; break;
    }

    let row = [
      escapeCsvField(r.registration_code),
      escapeCsvField(r.full_name),
      escapeCsvField(r.branch),
      escapeCsvField(`\t${r.phone}`), // \t لمنع Excel من حذف الصفر الأول في رقم الهاتف
      escapeCsvField(r.email),
      escapeCsvField(courseTitle),
      escapeCsvField(r.amount),
      escapeCsvField(methodText),
      escapeCsvField(statusText),
      escapeCsvField(formatDateTime(r.created_at)),
      escapeCsvField(r.approved_at ? formatDateTime(r.approved_at) : ''),
      escapeCsvField(r.admin_note || '')
    ];

    rows.push(row.join(','));
  });

  // إضافة UTF-8 BOM (\uFEFF) لضمان فتح الملف في Excel العربي بدون أي مشاكل تشفير
  let csvContent = '\uFEFF' + rows.join('\r\n');
  let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  let url = URL.createObjectURL(blob);

  let a = document.createElement('a');
  let dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `AMT-Registrations-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function initAdminReportsPage() {
  let authContext = await requireAdmin('login.html');
  if (!authContext) return;

  // خروج
  let signOutBtn = document.getElementById('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  // جلب كل التسجيلات
  try {
    cachedRegistrations = await getAllRegistrations();

    // استخراج الفروع المتاحة ديناميكياً
    let branchSelect = document.getElementById('export-branch');
    let branches = Array.from(new Set(cachedRegistrations.map(function (r) { return r.branch; }))).filter(Boolean);
    if (branchSelect) {
      branches.forEach(function (b) {
        let opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        branchSelect.appendChild(opt);
      });
    }

    // استخراج المراجعات
    let revisions = await getAllRevisions();
    let courseSelect = document.getElementById('export-course');
    if (courseSelect) {
      revisions.forEach(function (rev) {
        let opt = document.createElement('option');
        opt.value = rev.id;
        opt.textContent = rev.title;
        courseSelect.appendChild(opt);
      });
    }

    await updateReportPreview();

    ['export-course', 'export-status', 'export-branch'].forEach(function (id) {
      let el = document.getElementById(id);
      if (el) el.addEventListener('change', updateReportPreview);
    });

    let downloadBtn = document.getElementById('btn-download-csv');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadCSV);

  } catch (err) {
    console.error('Failed to init reports page:', err);
  }
}

document.addEventListener('DOMContentLoaded', initAdminReportsPage);

