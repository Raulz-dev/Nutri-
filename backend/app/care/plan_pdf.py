from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.care.plan_schemas import MealPlanResponse


def render_plan_pdf(plan: MealPlanResponse, patient_name: str) -> bytes:
    output = BytesIO()
    styles = getSampleStyleSheet()
    primary = colors.HexColor("#6d3ccf")
    primary_dark = colors.HexColor("#5428a8")
    tint = colors.HexColor("#f4f0fb")
    ink = colors.HexColor("#2f2543")
    styles["Title"].textColor = colors.white
    styles["BodyText"].textColor = ink
    for heading in ("Heading1", "Heading2", "Heading3", "Heading4"):
        styles[heading].textColor = primary_dark
    styles.add(
        ParagraphStyle(
            "Meal",
            parent=styles["Heading2"],
            textColor=primary_dark,
            backColor=tint,
            borderPadding=(8, 10, 8, 10),
            spaceAfter=14,
        )
    )
    styles.add(
        ParagraphStyle("Total", parent=styles["Heading3"], textColor=primary_dark, alignment=1)
    )
    styles.add(ParagraphStyle("Food", parent=styles["BodyText"], spaceAfter=4, leading=15))
    story = []
    content_width = A4[0] - 36 * mm - 12

    def paragraph(text: str, style: str = "Food"):
        story.append(Paragraph(escape(text).replace("\n", "<br/>"), styles[style]))

    def number(value: float) -> str:
        return f"{value:g}".replace(".", ",")

    def panel(rows, widths, background, padding=10):
        table = Table(rows, colWidths=widths, hAlign="LEFT")
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), background),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), padding),
                    ("RIGHTPADDING", (0, 0), (-1, -1), padding),
                    ("TOPPADDING", (0, 0), (-1, -1), padding),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
                ]
            )
        )
        return table

    story.append(
        panel(
            [[Paragraph("+Saúde | Plano alimentar", styles["Title"])]],
            [content_width],
            primary,
        )
    )
    story.append(Spacer(1, 4 * mm))
    paragraph(plan.title, "Heading1")
    details = [("Paciente", patient_name), ("Nutricionista", plan.author_name)]
    story.append(
        panel(
            [
                [
                    Paragraph(f"<b>{label}</b><br/>{escape(value)}", styles["Food"])
                    for label, value in details
                ]
            ],
            [content_width / 2] * 2,
            tint,
            padding=8,
        )
    )
    story.append(Spacer(1, 2 * mm))
    if plan.guidance:
        paragraph("Orientações", "Heading2")
        paragraph(plan.guidance)

    for meal in sorted(plan.meals, key=lambda item: item.time):
        start = len(story)
        story.append(Spacer(1, 4 * mm))
        paragraph(f"{meal.time} - {meal.title}", "Meal")
        for food in meal.foods:
            paragraph(f"{food.name} - {number(food.grams)} g")
        if meal.substitutions:
            paragraph("Substituições da refeição", "Heading3")
            paragraph(
                "Cada opção substitui a refeição inteira. "
                "Consuma todos os alimentos da opção escolhida."
            )
            for index, option in enumerate(meal.substitutions, 1):
                paragraph(f"Opção {index}", "Heading4")
                for food in option.foods:
                    paragraph(f"{food.name} - {number(food.grams)} g")

        story[start:] = [KeepTogether(story[start:])]

    totals = []
    for label, field, unit in [
        ("Calorias", "calories", "kcal"),
        ("Proteínas", "protein", "g"),
        ("Carboidratos", "carbs", "g"),
        ("Gorduras", "fats", "g"),
    ]:
        value = number(sum(getattr(meal, field) for meal in plan.meals))
        totals.append(Paragraph(f"{label}<br/>{value} {unit}", styles["Total"]))
    story.append(
        KeepTogether(
            [
                Paragraph("Totais do dia", styles["Heading2"]),
                panel([totals], [content_width / 4] * 4, tint),
            ]
        )
    )

    def footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(primary)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, 17 * mm, A4[0] - 18 * mm, 17 * mm)
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(primary_dark)
        canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, f"Página {document.page}")
        canvas.restoreState()

    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=22 * mm,
        title=plan.title,
        author=plan.author_name,
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
