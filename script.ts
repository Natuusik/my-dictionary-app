interface ProductionItem {
  id: number;
  code: string;
  title: string;
  status: 'ready' | 'half' | 'process';
  statusText: string;
  pdfUrl: string;
}

const items: ProductionItem[] = [
  {
    id: 1,
    code: "PRD-001",
    title: "Беспроводные наушники Aurora Pulse",
    status: "ready",
    statusText: "Готовый товар",
    pdfUrl: "./docs/doc-1.pdf"
  },
  {
    id: 2,
    code: "PRD-002",
    title: "Умные часы Smart Watch Pro",
    status: "half",
    statusText: "Выполнен на 50%",
    pdfUrl: "./docs/doc-2.pdf"
  },
  {
    id: 3,
    code: "PRD-003",
    title: "Портативная колонка SoundBar Mini",
    status: "process",
    statusText: "Работа в процессе",
    pdfUrl: "./docs/doc-3.pdf"
  }
];

const dashboardContainer = document.getElementById('dashboard-container');

function renderDashboard(): void {
  if (!dashboardContainer) return;

  dashboardContainer.innerHTML = '';

  // Настраиваем светлую палитру для секций
  const sections = [
    { 
      key: 'ready', 
      title: '✅ Готовый товар', 
      bgClass: 'bg-white border-emerald-200 shadow-xl shadow-stone-200/50', 
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
    },
    { 
      key: 'half', 
      title: '⏳ Выполнен на 50%', 
      bgClass: 'bg-white border-amber-200 shadow-xl shadow-stone-200/50', 
      badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200' 
    },
    { 
      key: 'process', 
      title: '🛠️ Работа в процессе', 
      bgClass: 'bg-white border-blue-200 shadow-xl shadow-stone-200/50', 
      badgeClass: 'bg-blue-50 text-blue-700 border border-blue-200' 
    }
  ];

  sections.forEach(section => {
    const groupItems = items.filter(item => item.status === section.key);
    
    const sectionDiv = document.createElement('div');
    sectionDiv.className = `rounded-3xl p-6 border ${section.bgClass}`;

    let tableContent = `
      <h2 class="text-xl font-bold mb-4 text-stone-900 flex items-center justify-between">
        <span>${section.title}</span>
        <span class="text-xs px-3 py-1 rounded-full font-semibold ${section.badgeClass}">${groupItems.length} поз.</span>
      </h2>
    `;

    if (groupItems.length === 0) {
      tableContent += `<p class="text-stone-400 text-sm italic py-2">Нет элементов в этой категории.</p>`;
    } else {
      tableContent += `
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-stone-200 text-stone-500 text-sm">
                <th class="py-3 px-4">№</th>
                <th class="py-3 px-4">Код и PDF</th>
                <th class="py-3 px-4">Название</th>
                <th class="py-3 px-4">Статус</th>
              </tr>
            </thead>
            <tbody>
      `;

      groupItems.forEach((item, index) => {
        tableContent += `
          <tr class="border-b border-stone-100 hover:bg-stone-50 transition-colors">
            <td class="py-3 px-4 text-stone-500 font-medium">${index + 1}</td>
            <td class="py-3 px-4">
              <div class="flex items-center space-x-2">
                <span class="font-mono font-bold text-stone-900">${item.code}</span>
                <a href="${item.pdfUrl}" target="_blank" title="Открыть PDF" class="bg-stone-100 hover:bg-stone-200 text-emerald-600 p-1.5 rounded-lg text-xs transition-colors flex items-center justify-center border border-stone-200">
                  📄 PDF
                </a>
              </div>
            </td>
            <td class="py-3 px-4 font-medium text-stone-800">${item.title}</td>
            <td class="py-3 px-4">
              <select class="status-select bg-stone-50 border border-stone-300 text-xs text-stone-800 rounded-xl py-1.5 px-3 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-sm" data-id="${item.id}">
                <option value="ready" ${item.status === 'ready' ? 'selected' : ''}>Готовый товар</option>
                <option value="half" ${item.status === 'half' ? 'selected' : ''}>Выполнен на 50%</option>
                <option value="process" ${item.status === 'process' ? 'selected' : ''}>Работа в процессе</option>
              </select>
            </td>
          </tr>
        `;
      });

      tableContent += `
            </tbody>
          </table>
        </div>
      `;
    }

    sectionDiv.innerHTML = tableContent;
    dashboardContainer.appendChild(sectionDiv);
  });

  // Привязываем события смены статуса
  const selects = document.querySelectorAll('.status-select') as NodeListOf<HTMLSelectElement>;

  selects.forEach(select => {
    select.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const itemId = Number(target.getAttribute('data-id'));
      const newStatus = target.value as 'ready' | 'half' | 'process';

      const item = items.find(i => i.id === itemId);
      if (item) {
        item.status = newStatus;
        renderDashboard();
      }
    });
  });
}

renderDashboard();
