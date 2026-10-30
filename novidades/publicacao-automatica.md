### Added
- **Canal de atualização** (Configurações > Este computador): no **Teste**, este computador recebe cada versão nova antes dos outros. Os outros só a recebem depois de "Liberar para todos" no GitHub. Voltar para o **Estável** instala a versão oficial.
- **Voltar versão:** o Chronos aceita instalar uma versão mais antiga quando ela volta a ser a oficial. Assim, o "Voltar versão" do GitHub devolve todos os computadores para a anterior em até uma hora, com a cópia de segurança de sempre antes.

### Changed
- **Publicação automática:** o merge na main já gera a versão sozinho (número, notas, tag e instalador), sem comando. Cada versão nova vai primeiro para o canal de teste.
- **"Verificar atualização"** procura no canal deste computador.
