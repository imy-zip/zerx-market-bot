
'use strict';

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  MediaGalleryBuilder,
  TextDisplayBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require('discord.js');

// =====================================
// CONFIGURATION ZERX MARKET
// =====================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID =
  process.env.GUILD_ID || '1195047756910309456';

const OWNER_ID = '1195042683064942624';

const SESSION_TIMEOUT = 15 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const sessions = new Map();

// Protège aussi contre les confirmations répétées
// après la fin d'une session, sur cette instance.
const completedPreviews = new Map();

if (!TOKEN || !CLIENT_ID) {
  throw new Error(
    'Variables DISCORD_TOKEN et CLIENT_ID manquantes.'
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =====================================
// OUTILS
// =====================================

function getSession() {
  const session = sessions.get(OWNER_ID);

  if (!session) return null;

  if (
    Date.now() - session.updated >
    SESSION_TIMEOUT
  ) {
    sessions.delete(OWNER_ID);
    return null;
  }

  return session;
}

function touch(session) {
  session.updated = Date.now();
}

function rowButtons(...items) {
  return new ActionRowBuilder().addComponents(
    items.map(([id, label, style]) =>
      new ButtonBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
    )
  );
}

function safeText(value) {
  return String(value || '')
    .replace(/@everyone/g, '@ everyone')
    .replace(/@here/g, '@ here')
    .replace(/<@/g, '< @')
    .trim();
}

function escapeMarkdown(value) {
  return safeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/([[\]()*_~`>|])/g, '\\$1');
}

function normalizeSiteUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';

  try {
    const url = new URL(raw);

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function formatAmount(value) {
  const amount = escapeMarkdown(value)
    .replace(/\n/g, ' ')
    .trim();

  return amount.includes('€')
    ? amount
    : `${amount}€`;
}

function getRFTitle(session) {
  const site = escapeMarkdown(session.site)
    .toUpperCase()
    .replace(/\n/g, ' ');

  const amount = formatAmount(session.amount);

  const siteTitle = session.siteUrl
    ? `[${site}](${session.siteUrl})`
    : site;

  return `${siteTitle} - ${amount}`;
}

function getImage(message) {
  return message.attachments.find(
    (attachment) =>
      attachment.contentType?.startsWith('image/') ||
      /\.(png|jpg|jpeg|webp|gif)$/i.test(
        attachment.name || ''
      )
  );
}

function getExtension(attachment) {
  const match = /\.(png|jpg|jpeg|webp|gif)$/i.exec(
    attachment.name || ''
  );

  return match ? match[1].toLowerCase() : 'png';
}

function isCompleted(previewId) {
  const timestamp = completedPreviews.get(previewId);

  if (!timestamp) return false;

  if (
    Date.now() - timestamp >
    SESSION_TIMEOUT
  ) {
    completedPreviews.delete(previewId);
    return false;
  }

  return true;
}

// =====================================
// PRÉPARATION DES PHOTOS
// =====================================

// On télécharge les images dès leur réception,
// pas au moment de cliquer sur Confirmer.

async function preparePhoto(attachment) {
  if (
    attachment.size &&
    attachment.size > MAX_IMAGE_BYTES
  ) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error(
      'Impossible de télécharger la photo.'
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  return {
    buffer,
    url: attachment.url,
    ext: getExtension(attachment),
  };
}

function getPreparedAttachments(session) {
  const files = [];
  const photoUrls = [];

  session.photos.forEach((photo, index) => {
    const filename =
      `zerx-market-${index + 1}.${photo.ext}`;

    files.push(
      new AttachmentBuilder(photo.buffer, {
        name: filename,
      })
    );

    photoUrls.push(
      `attachment://${filename}`
    );
  });

  return { files, photoUrls };
}

// =====================================
// DESIGN RF - INCHANGÉ
// =====================================

function buildRFVouch(session, photoUrls) {
  const container = new ContainerBuilder();

  const gallery = new MediaGalleryBuilder();

  for (const url of photoUrls) {
    gallery.addItems(
      (item) => item.setURL(url)
    );
  }

  container.addMediaGalleryComponents(gallery);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${getRFTitle(session)}`
    )
  );

  if (
    session.comment &&
    session.comment.trim()
  ) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `💬 ${safeText(session.comment)}`
      )
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('\u200B')
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        '**Liens utiles :**',
        '',
        '🛒 Liste boutiques : <#1195054550588076176>',
        '📩 Me contacter : <#1195054777025958008>',
        '📢 Partager le serveur : https://discord.gg/zYCc9fDZ3C',
      ].join('\n')
    )
  );

  return [container];
}

// =====================================
// DESIGN UE - INCHANGÉ
// =====================================

function buildUEVouch(session, photoUrls) {
  const container = new ContainerBuilder();

  const gallery = new MediaGalleryBuilder();

  for (const url of photoUrls) {
    gallery.addItems(
      (item) => item.setURL(url)
    );
  }

  container.addMediaGalleryComponents(gallery);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '**🍕 Nouvelle livraison terminée !**'
    )
  );

  // Espace invisible sous le titre
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('\u200B')
  );

  // Séparation Discord
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `👤 **Client :** ${escapeMarkdown(session.clientName)}`,
        '',
        `👨‍🍳 **Cuisto :** ${escapeMarkdown(session.cook)}`,
        '',
        `🍔 **Restaurant :** ${escapeMarkdown(session.restaurant)}`,
        '',
        `💵 **Total :** ${formatAmount(session.price)}`,
        '',
        `📝 **Avis Client :** ${escapeMarkdown(session.notes)}`,
      ].join('\n')
    )
  );

  return [container];
}

function buildVouch(session, photoUrls) {
  return session.type === 'UE'
    ? buildUEVouch(session, photoUrls)
    : buildRFVouch(session, photoUrls);
}

// =====================================
// CONTRÔLES DE PUBLICATION
// =====================================

function publishControls(session) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId('zm:channel')
    .setPlaceholder(
      '📢 Choisir le salon de publication'
    )
    .addChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement
    )
    .setMinValues(1)
    .setMaxValues(1);

  if (session.targetChannelId) {
    menu.setDefaultChannels(
      session.targetChannelId
    );
  }

  return [
    new ActionRowBuilder().addComponents(menu),

    rowButtons(
      [
        'zm:confirm',
        'Confirmer',
        ButtonStyle.Success,
      ],
      [
        'zm:cancel',
        'Annuler',
        ButtonStyle.Danger,
      ]
    ),
  ];
}

// =====================================
// PRÉVISUALISATION
// =====================================

async function showPreview(channel, session) {
  session.step = 'processing';
  touch(session);

  const preview = await channel.send({
    flags: MessageFlags.IsComponentsV2,

    components: [
      new TextDisplayBuilder().setContent(
        `### 👀 Prévisualisation du vouch ${session.type}`
      ),

      ...buildVouch(
        session,
        session.photos.map(
          (photo) => photo.url
        )
      ),

      new TextDisplayBuilder().setContent(
        '📢 **Choisis le salon de publication, puis confirme.**'
      ),

      ...publishControls(session),
    ],

    allowedMentions: { parse: [] },
  });

  session.previewMessageId = preview.id;
  session.step = 'preview';

  touch(session);
}

// =====================================
// COMMANDE /VOUCH
// =====================================

const command = new SlashCommandBuilder()
  .setName('vouch')
  .setDescription(
    'Créer un vouch Zerx Market'
  );

// =====================================
// DÉMARRAGE
// =====================================

client.once(Events.ClientReady, async () => {
  console.log(
    `✅ Zerx Market connecté : ${client.user.tag}`
  );

  try {
    const rest = new REST({
      version: '10',
    }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: [command.toJSON()],
      }
    );

    console.log(
      '✅ Commande /vouch enregistrée.'
    );
  } catch (error) {
    console.error(
      'Erreur enregistrement /vouch :',
      error
    );
  }
});

// =====================================
// INTERACTIONS
// =====================================

client.on(
  Events.InteractionCreate,
  async (interaction) => {
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isButton() &&
      !interaction.isModalSubmit() &&
      !interaction.isChannelSelectMenu()
    ) {
      return;
    }

    try {
      if (
        interaction.user.id !== OWNER_ID
      ) {
        return interaction.reply({
          content:
            '⛔ Tu ne peux pas utiliser ce bot.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (
        !interaction.inGuild() ||
        interaction.guildId !== GUILD_ID
      ) {
        return interaction.reply({
          content:
            '⛔ Serveur non autorisé.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // ==============================
      // COMMANDE /VOUCH
      // ==============================

      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName !==
          'vouch'
        ) {
          return;
        }

        sessions.set(OWNER_ID, {
          step: 'type',
          type: null,
          channelId:
            interaction.channelId,
          updated: Date.now(),
          photos: [],
          targetChannelId: null,
          publishing: false,
        });

        return interaction.reply({
          content:
            '📋 **De quel type est ce vouch ?**',

          components: [
            rowButtons(
              [
                'zm:rf',
                'RF',
                ButtonStyle.Primary,
              ],
              [
                'zm:ue',
                'UE',
                ButtonStyle.Success,
              ]
            ),
          ],

          flags: MessageFlags.Ephemeral,
        });
      }

      // Protection supplémentaire :
      // un ancien bouton Confirmer ne doit
      // jamais republier un vouch terminé.
      if (
        interaction.isButton() &&
        interaction.customId ===
          'zm:confirm' &&
        isCompleted(interaction.message.id)
      ) {
        return interaction.reply({
          content:
            '✅ Ce vouch a déjà été publié.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const session = getSession();

      if (
        !session ||
        session.channelId !==
          interaction.channelId
      ) {
        return interaction.reply({
          content:
            '⌛ Session expirée. Recommence avec `/vouch`.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // ==============================
      // BOUTON RF
      // ==============================

      if (
        interaction.isButton() &&
        interaction.customId ===
          'zm:rf'
      ) {
        if (
          session.step !== 'type'
        ) {
          return interaction.reply({
            content:
              'Ce formulaire a déjà été ouvert.',
            flags: MessageFlags.Ephemeral,
          });
        }

        session.type = 'RF';
        session.step = 'form';
        touch(session);

        const modal =
          new ModalBuilder()
            .setCustomId(
              'zm:form:rf'
            )
            .setTitle(
              'Vouch Zerx Market'
            );

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId('site')
                .setLabel(
                  'Nom du Site'
                )
                .setPlaceholder(
                  'Ex : Amazon.fr'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setMaxLength(100)
                .setRequired(true)
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'amount'
                )
                .setLabel('Montant')
                .setPlaceholder(
                  'Ex : 250'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setMaxLength(40)
                .setRequired(true)
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'siteUrl'
                )
                .setLabel(
                  'Lien du site (facultatif)'
                )
                .setPlaceholder(
                  'https://www.amazon.fr'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setMaxLength(500)
                .setRequired(false)
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'comment'
                )
                .setLabel(
                  'Commentaire (optionnel)'
                )
                .setPlaceholder(
                  'Donne ton avis...'
                )
                .setStyle(
                  TextInputStyle.Paragraph
                )
                .setMaxLength(900)
                .setRequired(false)
            )
        );

        return interaction.showModal(
          modal
        );
      }

      // ==============================
      // BOUTON UE
      // ==============================

      if (
        interaction.isButton() &&
        interaction.customId ===
          'zm:ue'
      ) {
        if (
          session.step !== 'type'
        ) {
          return interaction.reply({
            content:
              'Ce formulaire a déjà été ouvert.',
            flags: MessageFlags.Ephemeral,
          });
        }

        session.type = 'UE';
        session.step = 'form';
        touch(session);

        const modal =
          new ModalBuilder()
            .setCustomId(
              'zm:form:ue'
            )
            .setTitle(
              'Vouch UE Zerx Market'
            );

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'clientName'
                )
                .setLabel(
                  'Nom du Client'
                )
                .setPlaceholder(
                  'Ex : Paul'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setMaxLength(100)
                .setRequired(true)
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId('cook')
                .setLabel('Cuisto')
                .setPlaceholder(
                  'Ex : GordonEx'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setMaxLength(100)
                .setRequired(true)
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'restaurant'
                )
                .setLabel(
                  'Nom du Restaurant'
                )
                .setPlaceholder(
                  "Ex : McDonald's"
                )
                .setStyle(
                  TextInputStyle.Paragraph
                )
                .setMaxLength(200)
                .setRequired(true)
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'price'
                )
                .setLabel(
                  'Prix commande'
                )
                .setPlaceholder(
                  'Ex : 40'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setMaxLength(40)
                .setRequired(true)
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'notes'
                )
                .setLabel(
                  'Notes Client'
                )
                .setValue(
                  'Pas de commentaire.'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setMaxLength(500)
                .setRequired(true)
            )
        );

        return interaction.showModal(
          modal
        );
      }

      // ==============================
      // FORMULAIRE RF
      // ==============================

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          'zm:form:rf'
      ) {
        if (
          session.step !== 'form' ||
          session.type !== 'RF'
        ) {
          return interaction.reply({
            content:
              'Formulaire déjà traité.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const rawSiteUrl =
          interaction.fields
            .getTextInputValue(
              'siteUrl'
            );

        const siteUrl =
          normalizeSiteUrl(
            rawSiteUrl
          );

        if (siteUrl === null) {
          sessions.delete(
            OWNER_ID
          );

          return interaction.reply({
            content:
              '❌ Le lien doit commencer par `https://` ou `http://`. Recommence avec `/vouch`.',
            flags: MessageFlags.Ephemeral,
          });
        }

        session.site =
          interaction.fields
            .getTextInputValue(
              'site'
            );

        session.amount =
          interaction.fields
            .getTextInputValue(
              'amount'
            );

        session.siteUrl =
          siteUrl;

        session.comment =
          interaction.fields
            .getTextInputValue(
              'comment'
            ) || '';

        session.step = 'photo1';
        touch(session);

        return interaction.reply({
          content:
            '📸 **Envoie maintenant ta première photo dans ce salon.**',
          flags: MessageFlags.Ephemeral,
        });
      }

      // ==============================
      // FORMULAIRE UE
      // ==============================

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          'zm:form:ue'
      ) {
        if (
          session.step !== 'form' ||
          session.type !== 'UE'
        ) {
          return interaction.reply({
            content:
              'Formulaire déjà traité.',
            flags: MessageFlags.Ephemeral,
          });
        }

        session.clientName =
          interaction.fields
            .getTextInputValue(
              'clientName'
            );

        session.cook =
          interaction.fields
            .getTextInputValue(
              'cook'
            );

        session.restaurant =
          interaction.fields
            .getTextInputValue(
              'restaurant'
            );

        session.price =
          interaction.fields
            .getTextInputValue(
              'price'
            );

        session.notes =
          interaction.fields
            .getTextInputValue(
              'notes'
            );

        session.step = 'photo1';
        touch(session);

        return interaction.reply({
          content:
            '📸 **Envoie maintenant ta photo vouch UE dans ce salon.**',
          flags: MessageFlags.Ephemeral,
        });
      }

      // ==============================
      // DEUXIÈME PHOTO RF : OUI
      // ==============================

      if (
        interaction.isButton() &&
        interaction.customId ===
          'zm:photo2yes'
      ) {
        if (
          session.type !== 'RF' ||
          session.step !== 'ask2'
        ) {
          return interaction.reply({
            content:
              'Cette étape est terminée.',
            flags: MessageFlags.Ephemeral,
          });
        }

        session.step = 'photo2';
        touch(session);

        return interaction.update({
          content:
            '📸 **Envoie maintenant ta deuxième photo dans ce salon.**',
          components: [],
        });
      }

      // ==============================
      // DEUXIÈME PHOTO RF : NON
      // ==============================

      if (
        interaction.isButton() &&
        interaction.customId ===
          'zm:photo2no'
      ) {
        if (
          session.type !== 'RF' ||
          session.step !== 'ask2'
        ) {
          return interaction.reply({
            content:
              'Cette étape est terminée.',
            flags: MessageFlags.Ephemeral,
          });
        }

        session.step = 'processing';
        touch(session);

        await interaction.update({
          content:
            '✅ Préparation de la prévisualisation...',
          components: [],
        });

        return showPreview(
          interaction.channel,
          session
        );
      }

      // ==============================
      // CHOIX DU SALON
      // ==============================

      if (
        interaction.isChannelSelectMenu() &&
        interaction.customId ===
          'zm:channel'
      ) {
        if (
          session.step !==
            'preview' ||
          session.previewMessageId !==
            interaction.message.id
        ) {
          return interaction.reply({
            content:
              'Prévisualisation inactive.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const target =
          await interaction.guild
            .channels.fetch(
              interaction.values[0]
            )
            .catch(
              () => null
            );

        if (
          !target ||
          !target.send
        ) {
          return interaction.reply({
            content:
              '⛔ Salon non compatible.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const botMember =
          await interaction.guild
            .members.fetchMe();

        const permissions =
          target.permissionsFor(
            botMember
          );

        const needed = [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ];

        if (
          !permissions?.has(
            needed
          )
        ) {
          return interaction.reply({
            content:
              '⛔ Permissions insuffisantes dans ce salon.',
            flags: MessageFlags.Ephemeral,
          });
        }

        session.targetChannelId =
          target.id;

        touch(session);

        return interaction.update({
          components: [
            new TextDisplayBuilder()
              .setContent(
                `### 👀 Prévisualisation du vouch ${session.type}`
              ),

            ...buildVouch(
              session,
              session.photos.map(
                (photo) =>
                  photo.url
              )
            ),

            new TextDisplayBuilder()
              .setContent(
                `📢 **Publication dans :** <#${target.id}>`
              ),

            ...publishControls(
              session
            ),
          ],

          allowedMentions: {
            parse: [],
          },
        });
      }

      // ==============================
      // ANNULER
      // ==============================

      if (
        interaction.isButton() &&
        interaction.customId ===
          'zm:cancel'
      ) {
        if (
          session.step !==
            'preview' ||
          session.previewMessageId !==
            interaction.message.id
        ) {
          return interaction.reply({
            content:
              'Prévisualisation inactive.',
            flags: MessageFlags.Ephemeral,
          });
        }

        sessions.delete(
          OWNER_ID
        );

        return interaction.update({
          components: [
            new TextDisplayBuilder()
              .setContent(
                '❌ **Vouch annulé. Rien n’a été publié.**'
              ),
          ],
        });
      }

      // ==============================
      // CONFIRMER : ANTI-DOUBLON
      // ==============================

      if (
        interaction.isButton() &&
        interaction.customId ===
          'zm:confirm'
      ) {
        if (
          session.previewMessageId !==
          interaction.message.id
        ) {
          return interaction.reply({
            content:
              'Prévisualisation inactive.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Empêche une deuxième publication
        // pendant la première.
        if (
          session.publishing ||
          session.step ===
            'publishing'
        ) {
          return interaction.reply({
            content:
              '⏳ Publication déjà en cours. Patiente un instant.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (
          session.step !==
          'preview'
        ) {
          return interaction.reply({
            content:
              'Cette prévisualisation n’est plus active.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (
          !session.targetChannelId
        ) {
          return interaction.reply({
            content:
              '📢 Choisis d’abord le salon de publication.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Verrouillage AVANT le premier await.
        // Cela bloque les doubles clics.
        session.publishing = true;
        session.step = 'publishing';
        touch(session);

        await interaction.deferUpdate();

        try {
          const target =
            await interaction.guild
              .channels.fetch(
                session.targetChannelId
              );

          if (
            !target?.send
          ) {
            throw new Error(
              'Salon indisponible'
            );
          }

          // Photos déjà téléchargées !
          const {
            files,
            photoUrls,
          } = getPreparedAttachments(
            session
          );

          const published =
            await target.send({
              flags:
                MessageFlags.IsComponentsV2,

              components:
                buildVouch(
                  session,
                  photoUrls
                ),

              files,

              allowedMentions: {
                parse: [],
              },
            });

          // Dès que Discord confirme l'envoi,
          // on marque le vouch comme publié.
          completedPreviews.set(
            session.previewMessageId,
            Date.now()
          );

          const publishedType =
            session.type;

          sessions.delete(
            OWNER_ID
          );

          console.log(
            `✅ Vouch ${publishedType} publié : ${published.id}`
          );

          await interaction.message
            .edit({
              components: [
                new TextDisplayBuilder()
                  .setContent(
                    [
                      `## ✅ Vouch ${publishedType} publié !`,
                      '',
                      `📢 Salon : <#${target.id}>`,
                      `🔗 [Voir le vouch publié](${published.url})`,
                    ].join('\n')
                  ),
              ],
            })
            .catch(
              (error) => {
                console.error(
                  'Erreur modification prévisualisation :',
                  error
                );
              }
            );

        } catch (error) {
          console.error(
            'Erreur publication :',
            error
          );

          // Si l'envoi a échoué, on peut
          // réessayer sans recréer le vouch.
          session.publishing = false;
          session.step = 'preview';
          touch(session);

          await interaction.message
            .edit({
              components: [
                new TextDisplayBuilder()
                  .setContent(
                    '❌ **Publication impossible. Réessaie.**'
                  ),

                ...buildVouch(
                  session,
                  session.photos.map(
                    (photo) =>
                      photo.url
                  )
                ),

                ...publishControls(
                  session
                ),
              ],
            })
            .catch(
              () => {}
            );
        }

        return;
      }

    } catch (error) {
      console.error(
        'Erreur interaction :',
        error
      );

      const payload = {
        content:
          '❌ Une erreur est survenue. Réessaie.',
        flags:
          MessageFlags.Ephemeral,
      };

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction.followUp(
          payload
        ).catch(
          () => {}
        );
      } else {
        await interaction.reply(
          payload
        ).catch(
          () => {}
        );
      }
    }
  }
);

// =====================================
// RÉCEPTION DES PHOTOS
// =====================================

client.on(
  Events.MessageCreate,
  async (message) => {
    if (
      message.author.bot ||
      message.author.id !==
        OWNER_ID ||
      message.guildId !==
        GUILD_ID
    ) {
      return;
    }

    const session =
      getSession();

    if (
      !session ||
      session.channelId !==
        message.channelId ||
      ![
        'photo1',
        'photo2',
      ].includes(
        session.step
      )
    ) {
      return;
    }

    const attachment =
      getImage(message);

    if (
      !attachment
    ) {
      return;
    }

    if (
      attachment.size &&
      attachment.size >
        MAX_IMAGE_BYTES
    ) {
      return message.reply(
        '❌ Photo trop volumineuse. Utilise une image de moins de 8 Mo.'
      );
    }

    const previousStep =
      session.step;

    // Verrouillage immédiat :
    // évite de traiter deux fois une photo.
    session.step =
      'processing';

    touch(session);

    try {
      const photo =
        await preparePhoto(
          attachment
        );

      session.photos.push(
        photo
      );

      if (
        session.type ===
          'RF' &&
        previousStep ===
          'photo1'
      ) {
        session.step =
          'ask2';

        touch(session);

        await message.reply({
          content:
            '📸 **As-tu une 2e photo à ajouter ?**',

          components: [
            rowButtons(
              [
                'zm:photo2yes',
                'Oui',
                ButtonStyle.Success,
              ],
              [
                'zm:photo2no',
                'Non',
                ButtonStyle.Danger,
              ]
            ),
          ],
        });

      } else {
        // UE : preview après une photo.
        // RF : preview après la deuxième.
        await showPreview(
          message.channel,
          session
        );
      }

    } catch (error) {
      console.error(
        'Erreur traitement photo :',
        error
      );

      // Revenir à l'étape précédente
      // pour pouvoir renvoyer la photo.
      session.step =
        previousStep;

      touch(session);

      const content =
        error.message ===
        'IMAGE_TOO_LARGE'
          ? '❌ Photo trop volumineuse. Utilise une image de moins de 8 Mo.'
          : '❌ Impossible de préparer la photo. Réessaie.';

      await message.reply(
        content
      ).catch(
        () => {}
      );
    }
  }
);

// =====================================
// CONNEXION
// =====================================

client.login(TOKEN);
