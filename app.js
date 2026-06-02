import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  where,
  writeBatch,
  doc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const FIRESTORE_TIMEOUT_MS = 20000;

const firebaseConfig = {
  apiKey: "AIzaSyBeibFCHWV-kO_a7XkremPuKsw9Z_Ep6xg",
  authDomain: "sysdep-7d210.firebaseapp.com",
  projectId: "sysdep-7d210",
  storageBucket: "sysdep-7d210.firebasestorage.app",
  messagingSenderId: "1068148482018",
  appId: "1:1068148482018:web:ff50ed7199f7b77a65e3bb",
  measurementId: "G-T34127WLJ2",
};

const state = {
  db: null,
  ready: false,
  customers: [],
  materials: [],
  transactions: [],
  activeCustomerId: null,
  paymentCustomerId: null,
  editingMaterialId: null,
  editingTransactionId: null,
  search: "",
  theme: "light",
  notificationsOpen: false,
  pageBeforeNotifications: "dailyPage",
};

const els = {
  pageTitle: document.querySelector("#pageTitle"),
  firebaseNote: document.querySelector("#firebaseNote"),
  quickMenuBtn: document.querySelector("#quickMenuBtn"),
  quickMenu: document.querySelector("#quickMenu"),
  fabStack: document.querySelector("#fabStack"),
  openCustomerModal: document.querySelector("#openCustomerModal"),
  openAccountModal: document.querySelector("#openAccountModal"),
  refreshBtn: document.querySelector("#refreshBtn"),
  customerModal: document.querySelector("#customerModal"),
  accountModal: document.querySelector("#accountModal"),
  paymentModal: document.querySelector("#paymentModal"),
  paymentForm: document.querySelector("#paymentForm"),
  paymentCustomerName: document.querySelector("#paymentCustomerName"),
  paymentCurrentTotal: document.querySelector("#paymentCurrentTotal"),
  ledgerModal: document.querySelector("#ledgerModal"),
  customerForm: document.querySelector("#customerForm"),
  accountForm: document.querySelector("#accountForm"),
  materialForm: document.querySelector("#materialForm"),
  materialFormTitle: document.querySelector("#materialFormTitle"),
  materialSubmitBtn: document.querySelector("#materialSubmitBtn"),
  materialCancelEditBtn: document.querySelector("#materialCancelEditBtn"),
  ledgerAccountForm: document.querySelector("#ledgerAccountForm"),
  customersTable: document.querySelector("#customersTable"),
  materialsList: document.querySelector("#materialsList"),
  ledgerTable: document.querySelector("#ledgerTable"),
  customersEmpty: document.querySelector("#customersEmpty"),
  materialsEmpty: document.querySelector("#materialsEmpty"),
  ledgerEmpty: document.querySelector("#ledgerEmpty"),
  globalTotal: document.querySelector("#globalTotal"),
  customersCount: document.querySelector("#customersCount"),
  materialsCount: document.querySelector("#materialsCount"),
  accountCustomerSelect: document.querySelector("#accountCustomerSelect"),
  accountMaterialSelect: document.querySelector("#accountMaterialSelect"),
  accountMaterialInput: document.querySelector("#accountMaterialInput"),
  accountMaterialOptions: document.querySelector("#accountMaterialOptions"),
  accountMaterialsHint: document.querySelector("#accountMaterialsHint"),
  ledgerMaterialSelect: document.querySelector("#ledgerMaterialSelect"),
  ledgerMaterialInput: document.querySelector("#ledgerMaterialInput"),
  ledgerMaterialOptions: document.querySelector("#ledgerMaterialOptions"),
  ledgerMaterialsHint: document.querySelector("#ledgerMaterialsHint"),
  ledgerCustomerName: document.querySelector("#ledgerCustomerName"),
  ledgerCustomerPhone: document.querySelector("#ledgerCustomerPhone"),
  ledgerTotal: document.querySelector("#ledgerTotal"),
  customerSearch: document.querySelector("#customerSearch"),
  customerMaterialSelect: document.querySelector("#customerMaterialSelect"),
  customerMaterialValue: document.querySelector("#customerMaterialValue"),
  customerMaterialInput: document.querySelector("#customerMaterialInput"),
  customerMaterialOptions: document.querySelector("#customerMaterialOptions"),
  whatsappBtn: document.querySelector("#whatsappBtn"),
  pdfBtn: document.querySelector("#pdfBtn"),
  toast: document.querySelector("#toast"),
  themeToggleBtn: document.querySelector("#themeToggleBtn"),
  themeToggleIcon: document.querySelector("#themeToggleIcon"),
  notificationsBtn: document.querySelector("#notificationsBtn"),
  notificationsBadge: document.querySelector("#notificationsBadge"),
  notificationsPage: document.querySelector("#notificationsPage"),
  notificationsList: document.querySelector("#notificationsList"),
  notificationsEmpty: document.querySelector("#notificationsEmpty"),
  closeNotificationsBtn: document.querySelector("#closeNotificationsBtn"),
  ledgerDueBanner: document.querySelector("#ledgerDueBanner"),
  ledgerDueDate: document.querySelector("#ledgerDueDate"),
  transactionEditModal: document.querySelector("#transactionEditModal"),
  transactionEditForm: document.querySelector("#transactionEditForm"),
  transactionEditMaterialSelect: document.querySelector("#transactionEditMaterialSelect"),
  transactionEditMaterialInput: document.querySelector("#transactionEditMaterialInput"),
  transactionEditMaterialOptions: document.querySelector("#transactionEditMaterialOptions"),
  transactionEditMaterialsHint: document.querySelector("#transactionEditMaterialsHint"),
};

function money(value) {
  return Number(value || 0).toLocaleString("ar-IQ", {
    maximumFractionDigits: 2,
  });
}

function dateText(value) {
  if (!value) return new Date().toLocaleDateString("ar-IQ");
  if (value.toDate) return value.toDate().toLocaleDateString("ar-IQ");
  return new Date(value).toLocaleDateString("ar-IQ");
}

function parseDueDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isDueDateOverdue(dueDateValue) {
  const due = parseDueDate(dueDateValue);
  if (!due) return false;
  return startOfDay(due) < startOfDay(new Date());
}

function sortCustomersByName(customers) {
  return [...customers].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "ar", { sensitivity: "base" }),
  );
}

function getOverdueCustomers() {
  return sortCustomersByName(
    state.customers.filter((customer) => {
      const total = customerTotal(customer.id);
      return customer.dueDate && total > 0 && isDueDateOverdue(customer.dueDate);
    }),
  );
}

function dueDateCellHtml(customer) {
  if (!customer.dueDate) return '<span class="due-ok">-</span>';
  const overdue = isDueDateOverdue(customer.dueDate) && customerTotal(customer.id) > 0;
  const label = dateText(customer.dueDate);
  if (overdue) {
    return `<span class="due-overdue">${label}<span class="overdue-badge">متأخر</span></span>`;
  }
  return `<span class="due-ok">${label}</span>`;
}

async function syncCustomerDueDate(customerId, dueDate) {
  if (!dueDate || !state.ready) return;
  await updateRecord("customers", customerId, { dueDate });
}

function dueDateInputValue(value) {
  const due = parseDueDate(value);
  if (!due) return "";
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
}

async function syncCustomerDueDateFromTransactions(customerId) {
  if (!state.ready) return;

  const latestDebitDue = [...customerTransactions(customerId)]
    .reverse()
    .find((item) => Number(item.amount) > 0 && item.dueDate);

  const dueDate = latestDebitDue?.dueDate || null;
  await updateRecord("customers", customerId, { dueDate });

  const customer = state.customers.find((item) => item.id === customerId);
  if (customer) customer.dueDate = dueDate;
}

function initTheme() {
  const saved = localStorage.getItem("sysdep-theme");
  state.theme = saved === "dark" ? "dark" : "light";
  applyTheme(state.theme);
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("sysdep-theme", theme);
  els.themeToggleIcon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
  if (window.lucide) window.lucide.createIcons();
}

function toggleTheme() {
  applyTheme(state.theme === "dark" ? "light" : "dark");
}

const PAGE_TITLES = {
  dailyPage: "الحسابات اليومية",
  materialsPage: "المواد",
};

function closeNotificationsPage() {
  if (!state.notificationsOpen) return;
  state.notificationsOpen = false;
  els.notificationsPage.classList.remove("active");

  const returnPageId = state.pageBeforeNotifications || "dailyPage";
  const returnPage = document.querySelector(`#${returnPageId}`);
  if (returnPage) returnPage.classList.add("active");

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.page === returnPageId);
  });

  els.pageTitle.textContent = PAGE_TITLES[returnPageId] || PAGE_TITLES.dailyPage;
  updateFabVisibility(returnPageId);
}

function openNotificationsPage() {
  const activePage = document.querySelector(".page.active");
  if (activePage?.id && activePage.id !== "notificationsPage") {
    state.pageBeforeNotifications = activePage.id;
  }

  state.notificationsOpen = true;
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  els.notificationsPage.classList.add("active");
  els.pageTitle.textContent = "تنبيهات التسديد";
  updateFabVisibility("notificationsPage");
  renderNotifications();
  if (window.lucide) window.lucide.createIcons();
}

function renderNotifications() {
  const overdue = getOverdueCustomers();
  els.notificationsBadge.textContent = String(overdue.length);
  els.notificationsBadge.classList.toggle("hidden", overdue.length === 0);

  if (!overdue.length) {
    els.notificationsList.innerHTML = "";
    els.notificationsEmpty.classList.remove("hidden");
    return;
  }

  els.notificationsEmpty.classList.add("hidden");
  els.notificationsList.innerHTML = overdue
    .map(
      (customer) => `
        <li class="notification-item" data-open-ledger="${customer.id}">
          <strong>${customer.name}</strong>
          <span>لم يسدد حتى موعد ${dateText(customer.dueDate)}</span>
          <span>المبلغ المستحق: ${money(customerTotal(customer.id))} د.ع</span>
        </li>
      `,
    )
    .join("");
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function setFormLoading(form, loading, loadingText = "جاري الحفظ...") {
  const submitButton = form.querySelector('button[type="submit"]');
  if (!submitButton) return;

  if (loading) {
    submitButton.dataset.originalHtml = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = loadingText;
  } else {
    submitButton.disabled = false;
    if (submitButton.dataset.originalHtml) {
      submitButton.innerHTML = submitButton.dataset.originalHtml;
      delete submitButton.dataset.originalHtml;
    }
  }
}

function isFirebaseConfigured() {
  return !Object.values(firebaseConfig).some((value) => String(value).includes("PUT_YOUR"));
}

function firestoreErrorMessage(error) {
  const code = error?.code || "";

  if (code === "permission-denied") {
    return "رفض Firestore الحفظ. انشر ملف firestore.rules من Firebase Console.";
  }

  if (code === "not-found") {
    return "قاعدة Firestore غير موجودة. أنشئ Firestore Database من Firebase Console.";
  }

  if (code === "unavailable" || /network|offline|connection|certificate|timeout/i.test(error?.message || "")) {
    return "تعذر الاتصال بـ Firestore. تحقق من الإنترنت ثم أعد المحاولة.";
  }

  return error?.message || "حدث خطأ غير متوقع أثناء الاتصال بـ Firestore.";
}

async function withTimeout(promise, ms = FIRESTORE_TIMEOUT_MS, message = "انتهت مهلة الاتصال بـ Firestore.") {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function initFirebase() {
  if (!isFirebaseConfigured()) {
    els.firebaseNote?.classList.remove("hidden");
    toast("Firebase غير مفعّل بعد. ضع إعدادات مشروعك داخل app.js.");
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    state.db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
    state.ready = true;
    els.firebaseNote?.classList.add("hidden");
  } catch (error) {
    console.error("Firebase initialization error:", error);
    toast("حدث خطأ أثناء تهيئة Firebase. راجع كونسول المتصفح.");
  }
}

async function addRecord(collectionName, payload) {
  if (!state.ready) {
    toast("الحفظ يحتاج إعداد Firebase أولًا.");
    return false;
  }

  try {
    const docRef = await withTimeout(
      addDoc(collection(state.db, collectionName), {
        ...payload,
        createdAt: serverTimestamp(),
      }),
    );
    return docRef.id;
  } catch (error) {
    console.error(`addRecord(${collectionName}) error:`, error);
    toast(firestoreErrorMessage(error));
    return false;
  }
}

async function updateRecord(collectionName, id, payload) {
  if (!state.ready) {
    toast("التحديث يحتاج إعداد Firebase أولًا.");
    return false;
  }

  try {
    await withTimeout(
      updateDoc(doc(state.db, collectionName, id), {
        ...payload,
        updatedAt: serverTimestamp(),
      }),
    );
    return true;
  } catch (error) {
    console.error(`updateRecord(${collectionName}) error:`, error);
    toast(firestoreErrorMessage(error));
    return false;
  }
}

async function loadData() {
  if (!state.ready) {
    renderAll();
    return;
  }

  try {
    const [customersSnap, materialsSnap, transactionsSnap] = await withTimeout(
      Promise.all([
        getDocs(query(collection(state.db, "customers"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(state.db, "materials"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(state.db, "transactions"), orderBy("createdAt", "asc"))),
      ]),
    );

    state.customers = sortCustomersByName(
      customersSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })),
    );
    state.materials = materialsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
    state.transactions = transactionsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
  } catch (error) {
    console.error("loadData error:", error);
    toast(firestoreErrorMessage(error));
  }

  renderAll();
}

function customerTransactions(customerId) {
  return state.transactions.filter((item) => item.customerId === customerId);
}

function customerTotal(customerId) {
  return customerTransactions(customerId).reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function materialOptionLabel(material) {
  return `${material.name} - ${money(material.price)} د.ع`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeMaterialName(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const separatorIndex = trimmed.lastIndexOf(" - ");
  if (separatorIndex > 0 && trimmed.includes("د.ع")) {
    return trimmed.slice(0, separatorIndex).trim();
  }

  return trimmed;
}

function parseMaterialNamesInput(value) {
  return String(value || "")
    .split(/[،,]/)
    .map((part) => normalizeMaterialName(part))
    .filter(Boolean);
}

function findMaterialByName(name) {
  const normalized = normalizeMaterialName(name).toLowerCase();
  if (!normalized) return null;

  return state.materials.find((material) => material.name.toLowerCase() === normalized) || null;
}

async function ensureMaterialExists(name, price = 0) {
  const materialName = normalizeMaterialName(name);
  if (!materialName) return null;

  const existing = findMaterialByName(materialName);
  if (existing) return existing.name;

  const materialId = await addRecord("materials", {
    name: materialName,
    price: Number(price) || 0,
  });

  if (!materialId) return null;

  state.materials.unshift({ id: materialId, name: materialName, price: Number(price) || 0 });
  renderMaterials();
  renderStats();
  refreshMaterialSelectOptions();
  return materialName;
}

async function ensureMaterialsExist(names) {
  const uniqueNames = [...new Set(names.map((name) => normalizeMaterialName(name)).filter(Boolean))];
  const resolved = [];

  for (const name of uniqueNames) {
    const materialName = await ensureMaterialExists(name);
    if (!materialName) return null;
    resolved.push(materialName);
  }

  return resolved;
}

function getActiveMaterialSearchTerm(inputValue) {
  const parts = String(inputValue || "").split(/[،,]/);
  return parts[parts.length - 1].trim();
}

function renderMaterialSelectOptions(optionsElement, filter = "") {
  const search = filter.trim().toLowerCase();
  const filtered = state.materials.filter((material) => {
    return `${material.name} ${material.price}`.toLowerCase().includes(search);
  });

  const optionsHtml = filtered.length
    ? filtered
        .map(
          (material) => `
            <li
              class="searchable-select-option"
              role="option"
              data-material-id="${material.id}"
            >
              ${materialOptionLabel(material)}
            </li>
          `,
        )
        .join("")
    : "";

  const activeTerm = getActiveMaterialSearchTerm(filter);
  const hasExactMatch = activeTerm
    ? state.materials.some((material) => material.name.toLowerCase() === activeTerm.toLowerCase())
    : false;

  const createOptionHtml =
    activeTerm && !hasExactMatch
      ? `<li class="searchable-select-option searchable-select-create" role="option" data-create-name="${escapeHtml(activeTerm)}">
          إضافة "${escapeHtml(activeTerm)}" كمادة جديدة
        </li>`
      : "";

  if (!optionsHtml && !createOptionHtml) {
    optionsElement.innerHTML = `<li class="searchable-select-empty">لا توجد مواد مطابقة</li>`;
    return;
  }

  optionsElement.innerHTML = `${optionsHtml}${createOptionHtml}`;
}

function closeMaterialSelectOptions(optionsElement) {
  optionsElement.classList.add("hidden");
}

function openMaterialSelectOptions(inputElement, optionsElement) {
  renderMaterialSelectOptions(optionsElement, inputElement.value);
  optionsElement.classList.remove("hidden");
}

function applyMaterialSelection(inputElement, material, { append = false } = {}) {
  if (append) {
    const parts = String(inputElement.value || "")
      .split(/[،,]/)
      .map((part) => part.trim())
      .filter(Boolean);
    parts.pop();
    parts.push(materialOptionLabel(material));
    inputElement.value = parts.join("، ");
    return;
  }

  inputElement.value = materialOptionLabel(material);
}

function applyManualMaterialSelection(inputElement, name, { append = false } = {}) {
  const materialName = normalizeMaterialName(name);
  if (!materialName) return;

  if (append) {
    const parts = String(inputElement.value || "")
      .split(/[،,]/)
      .map((part) => part.trim())
      .filter(Boolean);
    parts.pop();
    parts.push(materialName);
    inputElement.value = parts.join("، ");
    return;
  }

  inputElement.value = materialName;
}

function syncMaterialInputValue(inputElement, { multiple = false } = {}) {
  const raw = inputElement.value.trim();
  if (!raw) return multiple ? [] : "";

  const names = parseMaterialNamesInput(raw);
  if (!names.length) return multiple ? [] : "";

  if (multiple) {
    return names.map((name) => {
      const match = findMaterialByName(name);
      return match ? match.name : normalizeMaterialName(name);
    });
  }

  const lastName = names[names.length - 1];
  const match = findMaterialByName(lastName);
  return match ? match.name : normalizeMaterialName(lastName);
}

async function transactionMaterialsForSave(form, inputElement) {
  const isCredit = formDirection(form);
  const materialNames = syncMaterialInputValue(inputElement, { multiple: true });

  if (!isCredit && !materialNames.length) {
    toast('يرجى اختيار مادة واحدة على الأقل لدين "عليه".');
    return null;
  }

  if (!materialNames.length) return [];

  return ensureMaterialsExist(materialNames);
}

function initMaterialSearchableSelect({ root, input, options, multiple = false }) {
  input.addEventListener("focus", () => openMaterialSelectOptions(input, options));
  input.addEventListener("input", () => openMaterialSelectOptions(input, options));
  input.addEventListener("blur", () => {
    window.setTimeout(() => closeMaterialSelectOptions(options), 120);
  });

  options.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  options.addEventListener("click", (event) => {
    const createOption = event.target.closest("[data-create-name]");
    if (createOption) {
      applyManualMaterialSelection(input, createOption.dataset.createName, { append: multiple });
      closeMaterialSelectOptions(options);
      return;
    }

    const option = event.target.closest("[data-material-id]");
    if (!option) return;

    const material = state.materials.find((item) => item.id === option.dataset.materialId);
    if (material) {
      applyMaterialSelection(input, material, { append: multiple });
      closeMaterialSelectOptions(options);
    }
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) {
      closeMaterialSelectOptions(options);
    }
  });
}

function refreshMaterialSelectOptions() {
  if (!els.customerMaterialOptions.classList.contains("hidden")) {
    renderMaterialSelectOptions(els.customerMaterialOptions, els.customerMaterialInput.value);
  }

  if (!els.accountMaterialOptions.classList.contains("hidden")) {
    renderMaterialSelectOptions(els.accountMaterialOptions, els.accountMaterialInput.value);
  }

  if (!els.ledgerMaterialOptions.classList.contains("hidden")) {
    renderMaterialSelectOptions(els.ledgerMaterialOptions, els.ledgerMaterialInput.value);
  }

  if (!els.transactionEditMaterialOptions.classList.contains("hidden")) {
    renderMaterialSelectOptions(els.transactionEditMaterialOptions, els.transactionEditMaterialInput.value);
  }
}

function updateMaterialsFieldHint(form, hintElement) {
  if (!hintElement) return;

  const isCredit = formDirection(form);
  hintElement.textContent = isCredit
    ? 'اختيار المواد اختياري عند "له". يمكنك كتابة اسم مادة جديدة.'
    : 'اختيار المواد مطلوب عند "عليه". يمكنك كتابة اسم مادة جديدة.';
}

function closeCustomerMaterialSelect() {
  closeMaterialSelectOptions(els.customerMaterialOptions);
}

function resetCustomerMaterialSelect() {
  els.customerMaterialValue.value = "";
  els.customerMaterialInput.value = "";
  closeCustomerMaterialSelect();
}

function resetAccountMaterialInput() {
  els.accountMaterialInput.value = "";
  closeMaterialSelectOptions(els.accountMaterialOptions);
}

function resetLedgerMaterialInput() {
  els.ledgerMaterialInput.value = "";
  closeMaterialSelectOptions(els.ledgerMaterialOptions);
}

function resetTransactionEditMaterialInput() {
  els.transactionEditMaterialInput.value = "";
  closeMaterialSelectOptions(els.transactionEditMaterialOptions);
}

function selectCustomerMaterial(material) {
  els.customerMaterialValue.value = material.name;
  applyMaterialSelection(els.customerMaterialInput, material);
  closeCustomerMaterialSelect();
}

function syncCustomerMaterialFromInput() {
  const materialName = syncMaterialInputValue(els.customerMaterialInput);
  if (!materialName) {
    els.customerMaterialValue.value = "";
    return false;
  }

  els.customerMaterialValue.value = materialName;
  const match = findMaterialByName(materialName);
  if (match) {
    els.customerMaterialInput.value = materialOptionLabel(match);
  } else {
    els.customerMaterialInput.value = materialName;
  }

  return true;
}

function openCustomerMaterialSelect() {
  openMaterialSelectOptions(els.customerMaterialInput, els.customerMaterialOptions);
}

function initCustomerMaterialSelect() {
  els.customerMaterialInput.addEventListener("focus", openCustomerMaterialSelect);
  els.customerMaterialInput.addEventListener("input", () => {
    els.customerMaterialValue.value = "";
    openCustomerMaterialSelect();
  });
  els.customerMaterialInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      syncCustomerMaterialFromInput();
      closeCustomerMaterialSelect();
    }, 120);
  });

  els.customerMaterialOptions.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  els.customerMaterialOptions.addEventListener("click", (event) => {
    const createOption = event.target.closest("[data-create-name]");
    if (createOption) {
      applyManualMaterialSelection(els.customerMaterialInput, createOption.dataset.createName);
      syncCustomerMaterialFromInput();
      closeCustomerMaterialSelect();
      return;
    }

    const option = event.target.closest("[data-material-id]");
    if (!option) return;

    const material = state.materials.find((item) => item.id === option.dataset.materialId);
    if (material) selectCustomerMaterial(material);
  });

  document.addEventListener("click", (event) => {
    if (!els.customerMaterialSelect.contains(event.target)) {
      closeCustomerMaterialSelect();
    }
  });
}

function renderAll() {
  renderCustomers();
  renderMaterials();
  renderSelects();
  renderStats();
  renderLedger();
  renderNotifications();
  if (window.lucide) window.lucide.createIcons();
}

function renderStats() {
  const total = state.customers.reduce((sum, customer) => sum + customerTotal(customer.id), 0);
  els.globalTotal.textContent = money(total);
  els.customersCount.textContent = state.customers.length;
  els.materialsCount.textContent = state.materials.length;
}

function renderCustomers() {
  const search = state.search.trim().toLowerCase();
  const rows = sortCustomersByName(
    state.customers.filter((customer) => {
      return `${customer.name} ${customer.phone}`.toLowerCase().includes(search);
    }),
  );

  els.customersTable.innerHTML = rows
    .map((customer) => {
      const total = customerTotal(customer.id);
      const lastTransaction = customerTransactions(customer.id).at(-1);
      const amountClass = total < 0 ? "amount-negative" : "amount-positive";
      return `
        <tr>
          <td data-label="اسم العميل">
            <button type="button" class="customer-name-link" data-open-ledger="${customer.id}">${customer.name}</button>
          </td>
          <td data-label="رقم الهاتف">${customer.phone}</td>
          <td data-label="آخر مادة">${lastTransaction?.materials?.join("، ") || customer.item || "-"}</td>
          <td data-label="تاريخ الدين">${dateText(customer.createdAt)}</td>
          <td data-label="موعد التسديد">${dueDateCellHtml(customer)}</td>
          <td data-label="المبلغ الحالي" class="${amountClass}">${money(total)}</td>
          <td data-label="إجراءات">
            <div class="row-actions">
              <button class="ghost-btn pay-btn" data-pay-customer="${customer.id}">
                <i data-lucide="wallet"></i>
                تسديد الديون
              </button>
              <button class="ghost-btn" data-open-ledger="${customer.id}">
                <i data-lucide="book-open"></i>
                عرض السجل
              </button>
              <button class="ghost-btn danger-btn" data-delete-customer="${customer.id}">
                <i data-lucide="trash-2"></i>
                حذف
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  els.customersEmpty.classList.toggle("hidden", rows.length > 0);
}

function resetMaterialForm() {
  state.editingMaterialId = null;
  els.materialForm.reset();
  els.materialFormTitle.textContent = "إضافة مادة";
  els.materialSubmitBtn.innerHTML = '<i data-lucide="save"></i> حفظ المادة';
  els.materialCancelEditBtn.classList.add("hidden");
  if (window.lucide) window.lucide.createIcons();
}

function openMaterialEdit(materialId) {
  const material = state.materials.find((item) => item.id === materialId);
  if (!material) return;

  state.editingMaterialId = materialId;
  els.materialForm.name.value = material.name;
  els.materialForm.price.value = material.price;
  els.materialFormTitle.textContent = "تعديل مادة";
  els.materialSubmitBtn.innerHTML = '<i data-lucide="save"></i> حفظ التعديلات';
  els.materialCancelEditBtn.classList.remove("hidden");
  els.materialForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (window.lucide) window.lucide.createIcons();
}

function renderMaterials() {
  els.materialsList.innerHTML = state.materials
    .map(
      (material) => `
        <li class="material-item">
          <div class="material-info">
            <strong>${material.name}</strong>
            <span>${money(material.price)} د.ع</span>
          </div>
          <div class="row-actions">
            <button class="ghost-btn" data-edit-material="${material.id}">
              <i data-lucide="pencil"></i>
              تعديل
            </button>
            <button class="ghost-btn danger-btn" data-delete-material="${material.id}">
              <i data-lucide="trash-2"></i>
              حذف
            </button>
          </div>
        </li>
      `,
    )
    .join("");
  els.materialsEmpty.classList.toggle("hidden", state.materials.length > 0);
}

async function deleteMaterial(materialId) {
  if (!state.ready) {
    toast("الحذف يحتاج إعداد Firebase أولًا.");
    return;
  }

  const material = state.materials.find((item) => item.id === materialId);
  if (!material) return;

  if (!window.confirm(`هل أنت متأكد أنك تريد حذف مادة "${material.name}"؟`)) {
    return;
  }

  try {
    await withTimeout(deleteDoc(doc(state.db, "materials", materialId)));

    if (state.editingMaterialId === materialId) {
      resetMaterialForm();
    }

    await loadData();
    toast("تم حذف المادة.");
  } catch (error) {
    console.error("deleteMaterial error:", error);
    toast(firestoreErrorMessage(error));
  }
}

function renderSelects() {
  const customerOptions = sortCustomersByName(state.customers)
    .map((customer) => `<option value="${customer.id}">${customer.name} - ${customer.phone}</option>`)
    .join("");

  els.accountCustomerSelect.innerHTML = customerOptions;
  refreshMaterialSelectOptions();
}

function renderLedger() {
  const customer = state.customers.find((item) => item.id === state.activeCustomerId);
  if (!customer) return;

  const transactions = customerTransactions(customer.id);
  const total = customerTotal(customer.id);
  els.ledgerCustomerName.textContent = customer.name;
  els.ledgerCustomerPhone.textContent = customer.phone;
  els.ledgerTotal.textContent = `${money(total)} د.ع`;
  els.ledgerTotal.className = total < 0 ? "amount-negative" : "amount-positive";

  if (customer.dueDate) {
    els.ledgerDueBanner.classList.remove("hidden");
    els.ledgerDueDate.textContent = dateText(customer.dueDate);
    const overdue = isDueDateOverdue(customer.dueDate) && total > 0;
    els.ledgerDueBanner.classList.toggle("overdue", overdue);
  } else {
    els.ledgerDueBanner.classList.add("hidden");
  }

  els.ledgerTable.innerHTML = transactions
    .map((item) => {
      const amountClass = item.amount < 0 ? "amount-negative" : "amount-positive";
      return `
        <tr>
          <td data-label="التاريخ">${dateText(item.createdAt)}</td>
          <td data-label="نوع الدين">${item.type}</td>
          <td data-label="المواد">${item.materials?.join("، ") || "-"}</td>
          <td data-label="المبلغ" class="${amountClass}">${money(item.amount)}</td>
          <td data-label="موعد التسديد">${item.dueDate ? dateText(item.dueDate) : "-"}</td>
          <td data-label="ملاحظة">${item.note || "-"}</td>
          <td data-label="إجراءات">
            <div class="row-actions ledger-row-actions">
              <button type="button" class="ghost-btn" data-edit-transaction="${item.id}">
                <i data-lucide="pencil"></i>
                تعديل
              </button>
              <button type="button" class="ghost-btn danger-btn" data-delete-transaction="${item.id}">
                <i data-lucide="trash-2"></i>
                حذف
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  els.ledgerEmpty.classList.toggle("hidden", transactions.length > 0);
}

function closeQuickMenu() {
  els.quickMenu.classList.add("hidden");
  els.quickMenuBtn.classList.remove("open");
}

function updateFabVisibility(pageId = document.querySelector(".page.active")?.id) {
  const showFab = pageId === "dailyPage";
  els.fabStack.classList.toggle("hidden", !showFab);
  if (!showFab) closeQuickMenu();
}

function openModal(modal) {
  closeQuickMenu();
  modal.showModal();
  if (window.lucide) window.lucide.createIcons();
}

function closeModal(id) {
  document.querySelector(`#${id}`).close();
}

function openLedger(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  state.activeCustomerId = customerId;
  state.editingTransactionId = null;
  renderLedger();
  resetLedgerMaterialInput();
  updateMaterialsFieldHint(els.ledgerAccountForm, els.ledgerMaterialsHint);

  const dueInput = els.ledgerAccountForm.querySelector('[name="dueDate"]');
  if (dueInput) {
    dueInput.value = customer?.dueDate ? dueDateInputValue(customer.dueDate) : "";
  }

  openModal(els.ledgerModal);
}

function openTransactionEdit(transactionId) {
  const transaction = state.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;

  state.editingTransactionId = transactionId;
  const isCredit = Number(transaction.amount) < 0;
  const direction = isCredit ? "credit" : "debit";

  const directionInput = els.transactionEditForm.querySelector(`[name="direction"][value="${direction}"]`);
  if (directionInput) directionInput.checked = true;
  els.transactionEditForm.amount.value = Math.abs(Number(transaction.amount || 0));
  els.transactionEditForm.dueDate.value = !isCredit && transaction.dueDate ? dueDateInputValue(transaction.dueDate) : "";
  els.transactionEditForm.note.value = transaction.note || "";
  els.transactionEditMaterialInput.value = transaction.materials?.join("، ") || "";
  updateMaterialsFieldHint(els.transactionEditForm, els.transactionEditMaterialsHint);
  openModal(els.transactionEditModal);
}

async function updateTransactionRecord(transactionId, { customerId, amount, isCredit, materials, note = "", dueDate = "" }) {
  const numericAmount = Math.abs(Number(amount || 0));
  const signedAmount = isCredit ? -numericAmount : numericAmount;
  const payload = {
    customerId,
    amount: signedAmount,
    type: isCredit ? "له" : "عليه",
    materials: materials || [],
    note,
    dueDate: !isCredit && dueDate ? dueDate : null,
  };

  const saved = await updateRecord("transactions", transactionId, payload);
  if (saved) {
    await syncCustomerDueDateFromTransactions(customerId);
  }

  return saved;
}

async function deleteTransaction(transactionId) {
  if (!state.ready) {
    toast("الحذف يحتاج إعداد Firebase أولًا.");
    return;
  }

  const transaction = state.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;

  if (!window.confirm("هل أنت متأكد أنك تريد حذف هذا الحساب من السجل؟")) {
    return;
  }

  try {
    await withTimeout(deleteDoc(doc(state.db, "transactions", transactionId)));

    if (state.editingTransactionId === transactionId) {
      state.editingTransactionId = null;
      els.transactionEditModal.close();
    }

    await loadData();
    await syncCustomerDueDateFromTransactions(transaction.customerId);
    toast("تم حذف الحساب من السجل.");
  } catch (error) {
    console.error("deleteTransaction error:", error);
    toast(firestoreErrorMessage(error));
  }
}

function openPaymentModal(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) return;

  const total = customerTotal(customerId);
  state.paymentCustomerId = customerId;
  els.paymentCustomerName.textContent = `${customer.name} - ${customer.phone}`;
  els.paymentCurrentTotal.textContent = `${money(total)} د.ع`;
  els.paymentCurrentTotal.className = total < 0 ? "amount-negative" : "amount-positive";
  els.paymentForm.reset();
  openModal(els.paymentModal);
}

async function createTransaction({ customerId, amount, isCredit, materials, note = "", dueDate = "" }) {
  const numericAmount = Math.abs(Number(amount || 0));
  const signedAmount = isCredit ? -numericAmount : numericAmount;
  const payload = {
    customerId,
    amount: signedAmount,
    type: isCredit ? "له" : "عليه",
    materials: materials || [],
    note,
  };

  if (dueDate && !isCredit) {
    payload.dueDate = dueDate;
  }

  const saved = await addRecord("transactions", payload);

  if (saved && dueDate && !isCredit) {
    await syncCustomerDueDate(customerId, dueDate);
  }

  return saved;
}

async function deleteCustomer(customerId) {
  if (!state.ready) {
    toast("الحذف يحتاج إعداد Firebase أولًا.");
    return;
  }

  if (!window.confirm("هل أنت متأكد أنك تريد حذف هذا العميل وجميع حساباته؟")) {
    return;
  }

  try {
    const customerRef = doc(state.db, "customers", customerId);
    const transactionsQuery = query(collection(state.db, "transactions"), where("customerId", "==", customerId));
    const transactionsSnap = await withTimeout(getDocs(transactionsQuery));
    const batch = writeBatch(state.db);
    transactionsSnap.docs.forEach((transactionDoc) => {
      batch.delete(doc(state.db, "transactions", transactionDoc.id));
    });
    batch.delete(customerRef);
    await withTimeout(batch.commit());

    if (state.activeCustomerId === customerId) {
      closeModal("ledgerModal");
      state.activeCustomerId = null;
    }

    if (state.paymentCustomerId === customerId) {
      closeModal("paymentModal");
      state.paymentCustomerId = null;
    }

    await loadData();
    toast("تم حذف العميل وجميع سجلاته.");
  } catch (error) {
    console.error("deleteCustomer error:", error);
    toast(firestoreErrorMessage(error));
  }
}

function buildInvoiceElement(customer, transactions, total) {
  const invoice = document.createElement("div");
  invoice.className = "invoice";
  invoice.innerHTML = `
    <h1>فاتورة حساب</h1>
    <p>ادارة الديون</p>
    <div class="invoice-meta">
      <div>
        <strong>اسم العميل:</strong> ${customer.name}<br />
        <strong>رقم الهاتف:</strong> ${customer.phone}
      </div>
      <div>
        <strong>تاريخ الطباعة:</strong> ${new Date().toLocaleDateString("ar-IQ")}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>نوع الدين</th>
          <th>المواد</th>
          <th>المبلغ</th>
        </tr>
      </thead>
      <tbody>
        ${transactions
          .map(
            (item) => `
              <tr>
                <td>${dateText(item.createdAt)}</td>
                <td>${item.type}</td>
                <td>${item.materials?.join("، ") || "-"}</td>
                <td>${money(item.amount)} د.ع</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
    <div class="invoice-total">المجموع الكلي: ${money(total)} د.ع</div>
  `;
  return invoice;
}

async function downloadPdf() {
  const customer = state.customers.find((item) => item.id === state.activeCustomerId);
  if (!customer) return;

  const transactions = customerTransactions(customer.id);
  const total = customerTotal(customer.id);
  const invoice = buildInvoiceElement(customer, transactions, total);
  document.body.appendChild(invoice);

  await window.html2pdf()
    .set({
      margin: 8,
      filename: `${customer.name}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(invoice)
    .save();

  invoice.remove();
}

function openWhatsApp() {
  const customer = state.customers.find((item) => item.id === state.activeCustomerId);
  if (!customer) return;

  const total = money(customerTotal(customer.id));
  const message = encodeURIComponent(`مرحبا ${customer.name}، مجموع الحساب الحالي هو ${total} د.ع`);
  const phone = String(customer.phone || "").replace(/[^\d]/g, "");
  window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener");
}

document.querySelectorAll(".nav-tab").forEach((button) => {
  button.addEventListener("click", () => {
    closeNotificationsPage();
    document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.page}`).classList.add("active");
    els.pageTitle.textContent = button.textContent.trim();
    updateFabVisibility(button.dataset.page);
  });
});

els.quickMenuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  const willOpen = els.quickMenu.classList.contains("hidden");
  closeQuickMenu();
  if (willOpen) {
    els.quickMenu.classList.remove("hidden");
    els.quickMenuBtn.classList.add("open");
    if (window.lucide) window.lucide.createIcons();
  }
});

els.openCustomerModal.addEventListener("click", () => {
  closeQuickMenu();
  resetCustomerMaterialSelect();
  openMaterialSelectOptions(els.customerMaterialInput, els.customerMaterialOptions);
  openModal(els.customerModal);
});
els.openAccountModal.addEventListener("click", () => {
  closeQuickMenu();
  resetAccountMaterialInput();
  updateMaterialsFieldHint(els.accountForm, els.accountMaterialsHint);
  openModal(els.accountModal);
});

els.accountForm.addEventListener("change", (event) => {
  if (event.target.name === "direction") {
    updateMaterialsFieldHint(els.accountForm, els.accountMaterialsHint);
  }
});

els.paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.paymentCustomerId) return;

  const formData = new FormData(els.paymentForm);
  const amount = Number(formData.get("amount") || 0);
  const currentTotal = customerTotal(state.paymentCustomerId);

  if (amount <= 0) {
    toast("أدخل مبلغ تسديد أكبر من صفر.");
    return;
  }

  if (currentTotal <= 0) {
    toast("لا يوجد دين مستحق على هذا العميل.");
    return;
  }

  setFormLoading(els.paymentForm, true, "جاري التسديد...");

  try {
    const note = String(formData.get("note") || "").trim();
    const saved = await createTransaction({
      customerId: state.paymentCustomerId,
      amount,
      isCredit: true,
      materials: [],
      note: note || "تسديد دين",
    });

    if (saved) {
      await loadData();
      els.paymentForm.reset();
      els.paymentModal.close();
      state.paymentCustomerId = null;
      toast("تم تسديد المبلغ وخصمه من الدين.");
    }
  } catch (error) {
    console.error("paymentForm error:", error);
    toast(firestoreErrorMessage(error));
  } finally {
    setFormLoading(els.paymentForm, false);
  }
});

els.ledgerAccountForm.addEventListener("change", (event) => {
  if (event.target.name === "direction") {
    updateMaterialsFieldHint(els.ledgerAccountForm, els.ledgerMaterialsHint);
  }
});

els.transactionEditForm.addEventListener("change", (event) => {
  if (event.target.name === "direction") {
    updateMaterialsFieldHint(els.transactionEditForm, els.transactionEditMaterialsHint);
  }
});

els.transactionEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.editingTransactionId) return;

  const transaction = state.transactions.find((item) => item.id === state.editingTransactionId);
  if (!transaction) return;

  const materials = await transactionMaterialsForSave(els.transactionEditForm, els.transactionEditMaterialInput);
  if (materials === null) return;

  setFormLoading(els.transactionEditForm, true);

  try {
    const formData = new FormData(els.transactionEditForm);
    const isCredit = formDirection(els.transactionEditForm);
    const saved = await updateTransactionRecord(state.editingTransactionId, {
      customerId: transaction.customerId,
      amount: formData.get("amount"),
      isCredit,
      materials,
      note: formData.get("note"),
      dueDate: isCredit ? "" : formData.get("dueDate"),
    });

    if (saved) {
      await loadData();
      state.editingTransactionId = null;
      els.transactionEditForm.reset();
      resetTransactionEditMaterialInput();
      els.transactionEditModal.close();
      toast("تم تحديث الحساب.");
    }
  } finally {
    setFormLoading(els.transactionEditForm, false);
  }
});

els.refreshBtn.addEventListener("click", loadData);
els.customerSearch.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderCustomers();
});

els.themeToggleBtn.addEventListener("click", toggleTheme);
els.notificationsBtn.addEventListener("click", () => {
  if (state.notificationsOpen) {
    closeNotificationsPage();
  } else {
    openNotificationsPage();
  }
});
els.closeNotificationsBtn.addEventListener("click", closeNotificationsPage);

document.addEventListener("click", (event) => {
  if (!event.target.closest("#fabStack")) {
    closeQuickMenu();
  }

  const notificationCustomerId = event.target.closest(".notification-item")?.dataset.openLedger;
  if (notificationCustomerId) {
    closeNotificationsPage();
    openLedger(notificationCustomerId);
  }

  const closeId = event.target.closest("[data-close]")?.dataset.close;
  if (closeId) closeModal(closeId);

  const customerId = event.target.closest("[data-open-ledger]")?.dataset.openLedger;
  if (customerId) openLedger(customerId);

  const payCustomerId = event.target.closest("[data-pay-customer]")?.dataset.payCustomer;
  if (payCustomerId) openPaymentModal(payCustomerId);

  const deleteCustomerId = event.target.closest("[data-delete-customer]")?.dataset.deleteCustomer;
  if (deleteCustomerId) deleteCustomer(deleteCustomerId);

  const editMaterialId = event.target.closest("[data-edit-material]")?.dataset.editMaterial;
  if (editMaterialId) openMaterialEdit(editMaterialId);

  const deleteMaterialId = event.target.closest("[data-delete-material]")?.dataset.deleteMaterial;
  if (deleteMaterialId) deleteMaterial(deleteMaterialId);

  const editTransactionId = event.target.closest("[data-edit-transaction]")?.dataset.editTransaction;
  if (editTransactionId) openTransactionEdit(editTransactionId);

  const deleteTransactionId = event.target.closest("[data-delete-transaction]")?.dataset.deleteTransaction;
  if (deleteTransactionId) deleteTransaction(deleteTransactionId);
});

function formDirection(form) {
  return form.querySelector('[name="direction"]:checked')?.value === "credit";
}

els.customerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!syncCustomerMaterialFromInput()) {
    toast("أدخل اسم مادة.");
    els.customerMaterialInput.focus();
    return;
  }

  setFormLoading(els.customerForm, true);

  try {
    const data = Object.fromEntries(new FormData(els.customerForm));
    const dueDate = data.dueDate || "";
    const materialName = await ensureMaterialExists(data.item);
    if (!materialName) return;

    const customerId = await addRecord("customers", {
      name: data.name.trim(),
      phone: data.phone,
      item: materialName,
      dueDate: dueDate || null,
    });

    if (customerId) {
      const saved = await createTransaction({
        customerId,
        amount: data.amount,
        isCredit: false,
        materials: [materialName],
        note: "دين أولي",
        dueDate,
      });

      if (saved) {
        await loadData();
        els.customerForm.reset();
        resetCustomerMaterialSelect();
        els.customerModal.close();
        toast("تم حفظ العميل.");
      }
    }
  } catch (error) {
    console.error("customerForm error:", error);
    toast(firestoreErrorMessage(error));
  } finally {
    setFormLoading(els.customerForm, false);
  }
});

els.accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const materials = await transactionMaterialsForSave(els.accountForm, els.accountMaterialInput);
  if (materials === null) return;

  setFormLoading(els.accountForm, true);

  try {
    const formData = new FormData(els.accountForm);
    const isCredit = formDirection(els.accountForm);
    const saved = await createTransaction({
      customerId: formData.get("customerId"),
      amount: formData.get("amount"),
      isCredit,
      materials,
      note: formData.get("note"),
      dueDate: isCredit ? "" : formData.get("dueDate"),
    });

    if (saved) {
      await loadData();
      els.accountForm.reset();
      resetAccountMaterialInput();
      els.accountModal.close();
      toast("تم حفظ الحساب.");
    }
  } finally {
    setFormLoading(els.accountForm, false);
  }
});

els.ledgerAccountForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const materials = await transactionMaterialsForSave(els.ledgerAccountForm, els.ledgerMaterialInput);
  if (materials === null) return;

  setFormLoading(els.ledgerAccountForm, true);

  try {
    const formData = new FormData(els.ledgerAccountForm);
    const isCredit = formDirection(els.ledgerAccountForm);
    const saved = await createTransaction({
      customerId: state.activeCustomerId,
      amount: formData.get("amount"),
      isCredit,
      materials,
      dueDate: isCredit ? "" : formData.get("dueDate"),
    });

    if (saved) {
      await loadData();
      els.ledgerAccountForm.reset();
      resetLedgerMaterialInput();
      toast("تمت إضافة الحساب إلى السجل.");
    }
  } finally {
    setFormLoading(els.ledgerAccountForm, false);
  }
});

els.materialCancelEditBtn.addEventListener("click", resetMaterialForm);

els.materialForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormLoading(els.materialForm, true);

  try {
    const data = Object.fromEntries(new FormData(els.materialForm));
    const payload = {
      name: data.name.trim(),
      price: Number(data.price || 0),
    };

    const isEditing = Boolean(state.editingMaterialId);
    let saved = false;

    if (isEditing) {
      saved = await updateRecord("materials", state.editingMaterialId, payload);
    } else {
      saved = Boolean(await addRecord("materials", payload));
    }

    if (saved) {
      await loadData();
      resetMaterialForm();
      toast(isEditing ? "تم تحديث المادة." : "تم حفظ المادة.");
    }
  } finally {
    setFormLoading(els.materialForm, false);
  }
});

els.whatsappBtn.addEventListener("click", openWhatsApp);
els.pdfBtn.addEventListener("click", downloadPdf);
initCustomerMaterialSelect();
initMaterialSearchableSelect({
  root: els.accountMaterialSelect,
  input: els.accountMaterialInput,
  options: els.accountMaterialOptions,
  multiple: true,
});
initMaterialSearchableSelect({
  root: els.ledgerMaterialSelect,
  input: els.ledgerMaterialInput,
  options: els.ledgerMaterialOptions,
  multiple: true,
});
initMaterialSearchableSelect({
  root: els.transactionEditMaterialSelect,
  input: els.transactionEditMaterialInput,
  options: els.transactionEditMaterialOptions,
  multiple: true,
});
initTheme();

await initFirebase();
await loadData();
updateFabVisibility();
if (window.lucide) window.lucide.createIcons();
