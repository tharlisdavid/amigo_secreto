# Sorteio de Natal: amigo secreto

Precisa só do Node 20 ou mais novo. Não tem nada para instalar.

    npm start        # http://localhost:2512
    npm test         # confere as regras do sorteio

1. Em "Criar um sorteio", preencha a festa e a lista de nomes.
2. Você cai na página do organizador. Guarde esse endereço (ele tem a sua chave).
3. Se quiser, diga quem não pode tirar quem, e clique em "Sortear os nomes".
4. Chame a turma pelo telão (QR code e PIN do sorteio) ou pelo link no WhatsApp. Cada um toca no próprio nome, cria uma senha de 4 números e abre o presente.

## Importar participantes

A lista pode vir de um arquivo `.txt`, `.csv` ou `.xlsx` (só esses), de até 2 MB:

- **TXT:** um nome por linha, ou separados por vírgula ou ponto e vírgula.
- **CSV e XLSX:** usa a coluna com título "Nome" ou "Participante" (e junta "Sobrenome", se houver). Sem título, usa a coluna que parece ter nomes. No XLSX vale a primeira aba visível com nomes.

Numeração, linhas vazias e repetidos saem sozinhos. O arquivo é lido no navegador e não é enviado.

## Demonstração

`/demo` mostra a árvore com os nomes nas bolinhas e sorteia uma a uma, sem salvar nada. A página está em `demo/arvore-amigo-secreto.html`. Para abrir com a sua lista, crie `demo/nomes.js` com `window.NOMES = ['Ana', 'Bruno', 'Carla'];` (fica fora do Git).

## Bom saber

- Cada sorteio tem a sua pasta em `dados`, com o nome da festa e um código que impede um de sobrescrever o outro: `natal-da-familia--Ab12Cd34/sorteio.json` e `participantes/nomes.txt`.
- Quem tirou quem e as listas de desejos ficam cifrados (AES-256-GCM). A chave fica separada (`CHAVE`). Isso evita ver sem querer; quem administra o servidor e tem a chave ainda conseguiria abrir.
- **Sem a chave os resultados não abrem.** Guarde cópia dos dois, em lugares separados.
- O organizador não vê o resultado na tela, mas pode apagar senhas (para quem esqueceu).
- Quem tocar primeiro em um nome cria a senha dele. Se alguém entrar no nome errado, apague a senha; se já tiver aberto o presente, desfaça o sorteio e sorteie de novo.
- Rodando com `npm start`, o link vale para quem está no mesmo Wi-Fi. Variáveis: `PORT`, `DADOS` (pasta dos arquivos), `CHAVE` (arquivo da chave) e `ENDERECO` (site usado nos links).

## Colocar na internet

Celular -> Vercel (site) -> túnel https -> Docker neste Linux (API). O computador precisa ficar ligado.

1. `deploy/subir-api.sh` sobe a API em um contêiner (`natal_api`), sem porta aberta na máquina.
2. `deploy/tunel.sh` abre um túnel https gratuito até a API e grava o endereço no `vercel.json`.
3. Envie o `vercel.json` para o `main`: o Vercel publica sozinho.
4. `deploy/subir-api.sh https://endereco-do-site` atualiza o endereço dos links.

O endereço do túnel muda se o computador ou o contêiner `natal_tunel` reiniciar. Nesse caso, repita os passos 2 e 3; os sorteios e os links da turma continuam os mesmos.

Para não precisar fazer isso na mão, `deploy/instalar-vigia.sh` instala um vigia que testa o site a cada minuto e, se o túnel cair, abre outro e envia o `vercel.json` sozinho (log: `journalctl --user -u natal-vigia -f`). Com o Cloudflare WARP ligado os contêineres ficam sem internet: o vigia já abre o túnel com `TUNEL_HOST=1`, pela rede do computador.

Para a demonstração (`/demo`) abrir com a sua lista, crie no Vercel a variável `NOMES` (separados por vírgula). O site é público: quem tiver o link vê os nomes.

Cópia de segurança: `docker cp natal_api:/dados ./copia-natal` e `docker cp natal_api:/chave ./copia-chave` (guarde em lugares separados).

Desenvolvido por Tharlis David
