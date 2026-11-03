// ============================================================
// admin-reports-page.js
// منطق صفحة التقارير وتصدير كشف Excel (CSV)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import { getAllRegistrations, getAllRevisions } from '../../services/admin-service.js';
import { formatPrice, formatDateTime, initSpotlightCards } from '../../core/utils.js';

// قائمة الفروع الثابتة
const UNIVERSITY_BRANCHES = [
  'فرع القاهرة', 'فرع الإسكندرية', 'فرع المنوفية (شبين الكوم)', 'فرع أسيوط',
  'فرع طنطا', 'فرع الزقازيق', 'فرع دمياط', 'فرع المنصورة', 'فرع بورسعيد',
  'فرع الإسماعيلية', 'فرع السويس', 'فرع بني سويف', 'فرع الفيوم', 'فرع المنيا',
  'فرع قنا', 'فرع الأقصر', 'فرع أسوان', 'فرع سوهاج', 'فرع كفر الشيخ',
  'فرع الغردقة', 'فرع السادات', 'فرع العريش', 'فرع مرسى مطروح', 'فرع شرم الشيخ', 'فرع آخر'
];

let cachedRegistrations = [];

async function updateReportPreview() {
  const courseVal = document.getElementById('export-course').value;
  const statusVal = document.getElementById('export-status').value;
  const branchVal = document.getElementById('export-branch').value;

  const filtered = cachedRegistrations.filter(r => {
    if (courseVal !== 'all' && r.course_id !== courseVal) return false;
    if (statusVal !== 'all' && r.payment_status !== statusVal) return false;
    if (branchVal !== 'all' && r.branch !== branchVal) return false;
    return true;
  });

  const countEl = document.getElementById('export-match-count');
  const revEl = document.getElementById('export-match-revenue');

  if (countEl) countEl.textContent = `${filtered.length} طالب`;

  const totalRevenue = filtered
    .filter(r => r.payment_status === 'paid')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  if (revEl) revEl.textContent = formatPrice(totalRevenue);

  return filtered;
}

function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

async function downloadCSV() {
  const filtered = await updateReportPreview();

  if (filtered.length === 0) {
    alert('لا توجد سجلات مطابقة للفلترة الحالية لتصديرها.');
    return;
  }

  // الترويسة العربية
  const headers = [
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

  const rows = [headers.map(escapeCsvField).join(',')];

  filtered.forEach(r => {
    const courseTitle = r.courses ? r.courses.title : '';
    const methodText = r.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';
    let statusText = '';
    switch (r.payment_status) {
      case 'paid': statusText = 'مؤكد (Paid)'; break;
      case 'under_review': statusText = 'قيد المراجعة'; break;
      case 'pending_payment': statusText = 'بانتظار التحويل'; break;
      case 'rejected': statusText = 'مرفوض'; break;
      default: statusText = r.payment_status; break;
    }

    const row = [
      escapeCsvField(r.registration_code),
      escapeCsvField(r.full_name),
      escapeCsvField(r.branch),
      escapeCsvField(`\t${r.phone}`), // \t لمنع Excel من حذف الصفر الأول
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

  // إضافة UTF-8 BOM (\uFEFF)
  const csvContent = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `AMT-Registrations-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function initAdminReportsPage() {
  const authContext = await requireAdmin('login.html');
  if (!authContext) return;

  // خروج
  const signOutBtn = document.getElementById('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  // جلب كل التسجيلات
  try {
    cachedRegistrations = await getAllRegistrations();

    // تعبئة فلتر الفروع
    const branchSelect = document.getElementById('export-branch');
    if (branchSelect) {
      UNIVERSITY_BRANCHES.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        branchSelect.appendChild(opt);
      });
      const dbBranches = Array.from(new Set(cachedRegistrations.map(r => r.branch))).filter(Boolean);
      dbBranches.forEach(b => {
        if (!UNIVERSITY_BRANCHES.includes(b)) {
          const opt = document.createElement('option');
          opt.value = b;
          opt.textContent = b + ' (إضافي)';
          branchSelect.appendChild(opt);
        }
      });
    }

    // استخراج المراجعات
    const revisions = await getAllRevisions();
    const courseSelect = document.getElementById('export-course');
    if (courseSelect) {
      revisions.forEach(rev => {
        const opt = document.createElement('option');
        opt.value = rev.id;
        opt.textContent = rev.title;
        courseSelect.appendChild(opt);
      });
    }

    await updateReportPreview();

    ['export-course', 'export-status', 'export-branch'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', updateReportPreview);
    });

    const downloadBtn = document.getElementById('btn-download-csv');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadCSV);

    initSpotlightCards();

  } catch (err) {
    console.error('Failed to init reports page:', err);
  }
}

document.addEventListener('DOMContentLoaded', initAdminReportsPage);
