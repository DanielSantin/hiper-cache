// Cenários do teste de caracterização dos kits (tests/kit.caracterizacao.test.js).
// Separado para o backend (hiper-database/tests/test_kits.py) usar as mesmas entradas:
//   node -e "process.stdout.write(JSON.stringify(require('./tests/kit.cenarios.js')()))"
// Medidas pequenas e grandes para passar pelos tiers de embalagem
// (parafuso avulso/caixa, massa 6/14/25 kg, fita 45/90 m, bucha, balde...).
function cenarios() {
  const c = {};
  const forro = { A: 0, P: 0, altPend: 0.6 };
  for (const [A, P] of [[12, 14], [85.5, 40], [400, 120]]) {
    c[`aramado A${A} P${P}`]     = [{ nomeKit: 'aramado',     medidas: { ...forro, A, P } }];
    c[`estruturado A${A} P${P}`] = [{ nomeKit: 'estruturado', medidas: { ...forro, A, P } }];
  }
  c['estruturado altPend 1,2 margem 10'] = [{ nomeKit: 'estruturado', medidas: { A: 50, P: 30, altPend: '1,2', margem: 10 } }];
  c['estruturado texto BR "1.234,5"']    = [{ nomeKit: 'estruturado', medidas: { A: '1.234,5', P: '140', altPend: 0.6 } }];
  for (const ML of [6, 35, 210]) {
    c[`cortineiro ML${ML}`]    = [{ nomeKit: 'cortineiro',    medidas: { A: ML, cant: 3.15 } }];
    c[`reforcoTrilho ML${ML}`] = [{ nomeKit: 'reforcoTrilho', medidas: { A: ML } }];
  }
  c['cortineiro cant 4'] = [{ nomeKit: 'cortineiro', medidas: { A: 20, cant: 4 } }];

  c['portas 1x padrão'] = [{ tipo: 'portas', grupos: [{ qtd: 1, larg: 0.7, alt: 2.1 }] }];
  c['portas 3 grupos']  = [{ tipo: 'portas', grupos: [
    { qtd: 4, larg: 0.8, alt: 2.1 }, { qtd: 2, larg: '0,6', alt: '2,1' }, { qtd: 1, larg: 0, alt: 0 }] }];

  const faces = ['ST', 'RU', 'CIM'];
  for (const estrutura of ['simples', 'dupla']) {
    for (const a of faces) {
      c[`parede 1F ${a} ${estrutura}`] = [{ tipo: 'parede', A: 30, cfg: { faces: 1, faceA: a, faceB: a, estrutura } }];
      for (const b of faces) {
        c[`parede ${a}/${b} ${estrutura}`] = [{ tipo: 'parede', A: 42, cfg: { faces: 2, faceA: a, faceB: b, estrutura } }];
      }
    }
  }
  c['parede ST/ST grande (tiers)'] = [{ tipo: 'parede', A: 520, cfg: { faces: 2, faceA: 'ST', faceB: 'ST', estrutura: 'simples' } }];
  c['parede CIM/CIM grande (tiers)'] = [{ tipo: 'parede', A: 260, cfg: { faces: 2, faceA: 'CIM', faceB: 'CIM', estrutura: 'simples' } }];
  c['parede ST/RU com vãos e margem'] = [{ tipo: 'parede', A: 60, areaVaos: 7.5, margem: 5, cfg: { faces: 2, faceA: 'ST', faceB: 'RU', estrutura: 'simples' } }];
  for (const m of ['48', '90']) {
    c[`parede ST/ST montante ${m}`] = [{ tipo: 'parede', A: 42, montante: m, cfg: { faces: 2, faceA: 'ST', faceB: 'ST', estrutura: 'dupla' } }];
  }

  // Vários kits no mesmo pedido: linhas compartilhadas somam e o rateio divide.
  c['combo forro + parede + portas'] = [
    { id: 'estruturado_1', nomeKit: 'estruturado', medidas: { A: 60, P: 32, altPend: 0.6 } },
    { id: 'parede_1', tipo: 'parede', A: 45, cfg: { faces: 2, faceA: 'ST', faceB: 'ST', estrutura: 'simples' } },
    { id: 'portas', tipo: 'portas', grupos: [{ qtd: 2, larg: 0.7, alt: 2.1 }] },
  ];
  c['combo duas sancas'] = [
    { id: 'cortineiro_1', nomeKit: 'cortineiro', medidas: { A: 10, cant: 3.15 } },
    { id: 'cortineiro_2', nomeKit: 'cortineiro', medidas: { A: 30, cant: 3.15 } },
  ];
  c['kit sem medida (rateio igual)'] = [
    { id: 'aramado_1', nomeKit: 'aramado', medidas: { A: 0, P: 0, altPend: 0.6 } },
    { id: 'aramado_2', nomeKit: 'aramado', medidas: { A: 0, P: 0, altPend: 0.6 } },
  ];
  return c;
}

module.exports = cenarios;
