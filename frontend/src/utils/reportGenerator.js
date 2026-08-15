import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Genera un reporte académico en PDF con 3 secciones:
 * 1. Resumen Ejecutivo (Métricas y Gráficos Visuales)
 * 2. Análisis de Comportamiento (Interpretación de datos)
 * 3. Detalle por Alumno (Tabla completa)
 */
export const generarReporteAcademico = (stats, detailedData, options = {}) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  // Soporta tanto el objeto global de dashboard como objetos planos de grupos/unidades
  const g = stats?.globales || stats || {};

  const metrics = [
    { label: 'Promedio General', value: Number(g.promedio_general || g.promedio_grupo || g.promedio_parcial || 0).toFixed(2) },
    { label: 'Mediana', value: Number(g.mediana || 0).toFixed(2) },
    { label: 'Desviación Estándar', value: Number(g.desviacion_estandar || 0).toFixed(2) },
    { label: 'Tasa de Reprobación', value: `${Number(g.tasa_reprobacion || 0).toFixed(1)}%` },
    { label: 'Alumnos en Riesgo', value: g.en_riesgo || 0 },
    { label: 'Total Estudiantes', value: g.total_estudiantes || g.total_alumnos || 0 }
  ];

  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(options.titulo_reporte || 'REPORTE ACADÉMICO INTEGRAL', margin, 25);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`, margin, 32);

  let y = 55;

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Resumen Ejecutivo', margin, y);
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Este apartado presenta los indicadores clave de desempeño académico.', margin, y);
  y += 15;

  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Valor']],
    body: metrics.map(m => [m.label, m.value]),
    theme: 'striped',
    headStyles: { fillStyle: [51, 65, 85] },
    margin: { left: margin, right: margin }
  });

  y = doc.lastAutoTable.finalY + 20;

  // Visualización simple: Distribución (Gráfico de barras manual) solo si existe la data
  if (stats.distribucion && Array.isArray(stats.distribucion) && stats.distribucion.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Distribución de Calificaciones', margin, y);
    y += 10;

    const maxQty = Math.max(...(stats.distribucion.map(d => d.cantidad) || [1]));
    const chartWidth = pageWidth - (margin * 2);
    const barHeight = 8;

    stats.distribucion.forEach((d, i) => {
      const barWidth = (d.cantidad / maxQty) * (chartWidth - 40);
      doc.setFillColor(99, 102, 241); // Indigo-500
      doc.rect(margin + 30, y, barWidth, barHeight, 'F');

      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`${d.rango}-${d.rango + 9}`, margin, y + 6);
      doc.setTextColor(0);
      doc.text(d.cantidad.toString(), margin + 35 + barWidth, y + 6);
      y += barHeight + 2;
    });
    y += 10;
  }

  y += 20;

  if ((stats.globales || stats.materias_criticas) && y < 240) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Análisis de Comportamiento', margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    if (stats.globales) {
      const g = stats.globales;
      const interpretacion = [
        `El promedio general del sistema se sitúa en ${Number(g.promedio_general || 0).toFixed(2)}.`,
        `Se observa una tasa de reprobación del ${Number(g.tasa_reprobacion || 0).toFixed(1)}%, lo cual requiere atención inmediata en las materias críticas identificadas.`,
        `La desviación estándar de ${Number(g.desviacion_estandar || 0).toFixed(2)} indica la dispersión de los resultados respecto al promedio.`
      ];

      interpretacion.forEach(line => {
        doc.text(`• ${line}`, margin, y);
        y += 7;
      });
      y += 5;
    }

    if (stats.materias_criticas && Array.isArray(stats.materias_criticas) && stats.materias_criticas.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Materias Críticas (Bajo Desempeño):', margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');

      stats.materias_criticas.forEach(m => {
        doc.text(`- ${m.materia}: Promedio ${Number(m.promedio || 0).toFixed(2)} (${m.reprobados} reprobados)`, margin + 5, y);
        y += 6;
      });
    }
  }

  doc.addPage();
  y = 20;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(options.seccion_detalle_titulo || '3. Detalle por Alumno', margin, y);
  y += 10;

  const tableHead = options.headers || [['No. Control', 'Alumno', 'Bonus', 'Razón', 'Calificación', 'Estado']];
  const tableBody = options.body || detailedData.map(d => [
    d.no_control ?? d.matricula,
    d.alumno,
    (d.bonus_materia || d.bonus_unidad || d.bonus) ? `+${d.bonus_materia || d.bonus_unidad || d.bonus}` : '0',
    d.justificacion || d.justificacion_bonus || '',
    Number(d.resultado_final || d.resultado || 0).toFixed(2),
    d.estatus || (Number(d.resultado_final || d.resultado || 0) >= 70 ? 'APROBADO' : 'REPROBADO')
  ]);

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: options.columnStyles || {
      [tableHead[0].length - 1]: { fontStyle: 'bold' }
    },
    didParseCell: (data) => {
      if (options.onCellParse) {
        options.onCellParse(data);
        return;
      }
      if (data.section === 'body' && data.column.index === tableHead[0].length - 1) {
        if (data.cell.raw === 'REPROBADO') {
          data.cell.styles.textColor = [220, 38, 38]; // Red-600
        } else if (data.cell.raw === 'APROBADO') {
          data.cell.styles.textColor = [22, 163, 74]; // Green-600
        }
      }
    }
  });

  // Pie de página en todas las hojas
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Hoja ${i} de ${pageCount} - Sistema de Gestión Académica`, pageWidth / 2, 285, { align: 'center' });
  }

  const finalFilename = options.filename || options.nombre_archivo || `Reporte_Academico_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(finalFilename);
};
