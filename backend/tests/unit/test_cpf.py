import pytest

from app.users.domain.cpf import normalize_cpf


@pytest.mark.parametrize("value", ["11144477735", "111.444.777-35", " 111.444.777-35 "])
def test_cpf_normalizes_valid_check_digits(value):
    assert normalize_cpf(value) == "11144477735"


@pytest.mark.parametrize(
    "value",
    [
        "",
        "11111111111",
        "00000000000",
        "11144477734",
        "123",
        "abc11144477735",
        "１１１４４４７７７３５",
        None,
        11144477735,
    ],
)
def test_cpf_rejects_invalid_values(value):
    with pytest.raises(ValueError, match="CPF válido"):
        normalize_cpf(value)
