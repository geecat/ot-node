/* eslint-disable indent,no-trailing-spaces */
const gs1importer = require('./modules/gs1-importer')();
const xmlpath = './importers/validation_test.xml';
const xsdpath = './importers/EPCglobal-epcis-masterdata-1_2.xsd';


gs1importer.parseGS1(xmlpath, xsdpath, (response) => {
     console.log(response);

     // for(let a in whole_object) {
     //     let s = whole_object[a];
     //
     //     for(let x in s) {
     //         let c = s[x];
     //
     //         for(let y in c) {
     //             let result = c[y];
     //             participant_id = result['participant_id'];
     //             console.log(participant_id);
     //             let kk = participant_id.includes('urn:ot:mda:participant', 0);
     //
     //             if(!participant_id.includes('urn:ot:mda:participant', 0) == true) {
     //                 console.log('Invalid Participant ID');
     //             } else {
     //                 console.log('Valid Participant ID');
     //             }
     //         }
     //     }
     //
     // }


 });

