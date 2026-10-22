import re


def normalize_cpf(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(
        r"(?:[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})", value.strip()
    ):
        raise ValueError("Informe um CPF válido.")
    digits = re.sub(r"[.-]", "", value.strip())
    if len(set(digits)) == 1:
        raise ValueError("Informe um CPF válido.")
    for size in (9, 10):
        total = sum(
            int(digit) * weight
            for digit, weight in zip(digits[:size], range(size + 1, 1, -1), strict=True)
        )
        check = (total * 10 % 11) % 10
        if check != int(digits[size]):
            raise ValueError("Informe um CPF válido.")
    return digits
