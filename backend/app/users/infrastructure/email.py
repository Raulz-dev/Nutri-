import asyncio
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode


class SMTPPasswordResetSender:
    def __init__(self, host: str, port: int, from_email: str, reset_url: str) -> None:
        self._host = host
        self._port = port
        self._from_email = from_email
        self._reset_url = reset_url

    async def __call__(self, recipient: str, token: str) -> None:
        query = urlencode({"token": token})
        message = EmailMessage()
        message["Subject"] = "Redefinição de senha do Nutri +"
        message["From"] = self._from_email
        message["To"] = recipient
        message.set_content(
            "Use o link abaixo para redefinir sua senha:\n\n"
            f"{self._reset_url}?{query}\n\n"
            "Se você não solicitou a redefinição, ignore esta mensagem."
        )
        await asyncio.to_thread(self._send, message)

    def _send(self, message: EmailMessage) -> None:
        with smtplib.SMTP(self._host, self._port, timeout=10) as smtp:
            smtp.send_message(message)
