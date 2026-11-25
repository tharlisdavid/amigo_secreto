# Sorteio de Natal: amigo secreto

Precisa só do Node 20 ou mais novo. Não tem nada para instalar.

    npm start        # http://localhost:2512
    npm test         # confere as regras do sorteio

1. Na página inicial, preencha a festa e a lista de nomes.
2. Você cai na página do organizador. Guarde esse endereço (ele tem a sua chave).
3. Se quiser, diga quem não pode tirar quem, e clique em "Sortear os nomes".
4. Mande o link da turma no WhatsApp. Cada um toca no próprio nome, cria um PIN e abre o presente.

## Demonstração

`http://localhost:2512/demo` mostra a árvore com os nomes nas bolinhas e sorteia uma a uma, sem salvar nada. A página está em `demo/arvore-amigo-secreto.html`. Para abrir com a sua lista, crie `demo/nomes.js` com `window.NOMES = ['Ana', 'Bruno', 'Carla'];` (fica fora do Git).

## Bom saber

- Cada sorteio é um arquivo em `data/`. Faça cópia dessa pasta; e não abra se não quiser estragar a surpresa.
- O organizador não vê o resultado na tela, mas pode apagar PINs (para quem esqueceu).
- Quem tocar primeiro em um nome cria o PIN dele. Se alguém entrar no nome errado, apague o PIN; se já tiver aberto o presente, desfaça o sorteio e sorteie de novo.
- Rodando com `npm start`, o link vale para quem está no mesmo Wi-Fi. Variáveis: `PORT`, `DADOS` (pasta dos arquivos) e `ENDERECO` (site usado nos links).

## Colocar na internet

Celular -> Vercel (site) -> túnel https -> Docker neste Linux (API). O computador precisa ficar ligado.

1. `deploy/subir-api.sh` sobe a API em um contêiner (`natal_api`), só em localhost:2512.
2. Um túnel https aponta para `http://localhost:2512`.
3. O Vercel publica a cada envio para o `main`, usando o `vercel.json`. Por enquanto a página inicial leva para `/demo`.
   Para a demonstração abrir com a sua lista, crie no Vercel a variável `NOMES` (nomes separados por vírgula). O site é público: quem tiver o link vê os nomes.
4. Com o túnel pronto, inclua no `vercel.json` o rewrite de `/api` e tire o redirect da página inicial.

Cópia de segurança: `docker cp natal_api:/dados ./copia-natal`

Desenvolvido por Tharlis David
