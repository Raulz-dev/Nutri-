export function validClinicalDecimal(value: string, min: number, max: number) {
  return (
    value.trim() !== "" &&
    /^\d+(?:\.\d)?$/.test(value) &&
    Number(value) >= min &&
    Number(value) <= max
  );
}
